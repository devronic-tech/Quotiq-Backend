const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize');
const { Expense, Liability, Subscription, Payroll, Transaction, Invoice, Customer, Payment, Quotation } = require('../models/index.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { ValidationError, NotFoundError } = require('../utils/app-error.js');
const { seedFinanceData } = require('../utils/finance-seeder.js');
const { env } = require('../config/env.js');
const { logger } = require('../utils/logger.js');

/**
 * Trigger Seeding manually
 */
const triggerSeed = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  await seedFinanceData(tenantId);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Financial data seeded successfully'
  });
});

/**
 * GET /api/v1/finance/summary
 */
const getFinanceSummary = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  // 1. Calculate Incomes vs Expenses from ledger and client invoices (cash basis)
  const transactions = await Transaction.findAll({ where: { tenantId } });
  const invoicesListForBalance = await Invoice.findAll({ where: { tenantId } });

  const totalInvoiceRevenue = invoicesListForBalance.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
  
  let totalIncome = totalInvoiceRevenue;
  let totalExpense = 0;
  let last30DaysIncome = 0;
  let last30DaysExpense = 0;
  let prev30DaysExpense = 0;
  let prev30DaysIncome = 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  transactions.forEach(t => {
    const amt = Number(t.amount);
    const tDate = new Date(t.date);
    const isRecent = tDate >= thirtyDaysAgo;
    const isPrevRange = tDate >= sixtyDaysAgo && tDate < thirtyDaysAgo;

    if (t.type === 'income') {
      totalIncome += amt;
      if (isRecent) last30DaysIncome += amt;
      if (isPrevRange) prev30DaysIncome += amt;
    } else {
      const val = Math.abs(amt);
      totalExpense += val;
      if (isRecent) last30DaysExpense += val;
      if (isPrevRange) prev30DaysExpense += val;
    }
  });

  invoicesListForBalance.forEach(inv => {
    const amt = Number(inv.amountPaid);
    const invDate = new Date(inv.issueDate);
    const isRecent = invDate >= thirtyDaysAgo;
    const isPrevRange = invDate >= sixtyDaysAgo && invDate < thirtyDaysAgo;

    if (isRecent) last30DaysIncome += amt;
    if (isPrevRange) prev30DaysIncome += amt;
  });

  const companyBalance = totalIncome - totalExpense;

  let revenueGrowth = 0;
  if (prev30DaysIncome > 0) {
    revenueGrowth = Number((((last30DaysIncome - prev30DaysIncome) / prev30DaysIncome) * 100).toFixed(1));
  }

  const prev30DaysBalance = prev30DaysIncome - prev30DaysExpense;
  const last30DaysBalance = last30DaysIncome - last30DaysExpense;
  let balanceGrowth = 0;
  if (Math.abs(prev30DaysBalance) > 0) {
    balanceGrowth = Number((((last30DaysBalance - prev30DaysBalance) / Math.abs(prev30DaysBalance)) * 100).toFixed(1));
  }

  // 2. Pending Liabilities & Payroll
  const pendingLiabilities = await Liability.findAll({ where: { tenantId, status: 'pending' } });
  const pendingPayroll = await Payroll.findAll({ where: { tenantId, status: { [Op.ne]: 'paid' } } });

  const totalPendingLiabilities = pendingLiabilities.reduce((sum, l) => sum + Number(l.amount), 0);
  const totalPendingPayroll = pendingPayroll.reduce((sum, p) => sum + Number(p.pending), 0);

  const availableCash = companyBalance - totalPendingLiabilities;

  // 3. Pending Invoices (Revenue due)
  const pendingInvoices = await Invoice.findAll({ 
    where: { tenantId, status: { [Op.in]: ['unpaid', 'partially_paid'] } } 
  });
  const pendingRevenue = pendingInvoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) - Number(inv.amountPaid)), 0);

  // 4. Burn Rate & Runway
  const burnRate = last30DaysExpense > 0 ? last30DaysExpense : 0;
  const runwayMonths = burnRate > 0 ? Number((companyBalance / burnRate).toFixed(1)) : 0;

  // 5. Critical Liabilities & Renewals
  const criticalLiabilitiesCount = pendingLiabilities.filter(l => l.priority === 'critical' || new Date(l.dueDate) <= new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)).length;
  const upcomingPayrollAmount = totalPendingPayroll;
  const taxesDue = pendingLiabilities.filter(l => l.category === 'Taxes').reduce((sum, l) => sum + Number(l.amount), 0);

  // 6. Subscriptions cost and renewals
  const subscriptions = await Subscription.findAll({ where: { tenantId, status: 'active' } });
  const subscriptionCostMonthly = subscriptions.reduce((sum, s) => {
    return sum + (s.billingCycle === 'monthly' ? Number(s.cost) : Number(s.cost) / 12);
  }, 0);
  const upcomingRenewalsCount = subscriptions.filter(s => new Date(s.renewalDate) <= new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)).length;

  const netProfit = last30DaysIncome - last30DaysExpense;
  const profitMargin = last30DaysIncome > 0 ? Number(((netProfit / last30DaysIncome) * 100).toFixed(1)) : 0;

  // 7. Calculate Revenue Sources Pie Chart data dynamically (strictly using real invoices)
  const invoicesList = await Invoice.findAll({ 
    where: { tenantId },
    include: [{ model: Quotation, as: 'quotation' }]
  });
  const revGroup = {};
  invoicesList.forEach(inv => {
    const t = inv.type || 'Other';
    revGroup[t] = (revGroup[t] || 0) + Number(inv.amountPaid);
  });
  const revenueSourcesPie = Object.keys(revGroup).map((key, idx) => {
    const colors = ['#004ac6', '#2563eb', '#505f76', '#6366f1', '#0ea5e9', '#ec4899', '#ef4444', '#14b8a6'];
    return {
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: revGroup[key],
      color: colors[idx % colors.length]
    };
  });

  // 8. Calculate Project Profitability dynamically (strictly using real data)
  const allExpenses = await Expense.findAll({ where: { tenantId } });
  const projMap = {};
  invoicesList.forEach(inv => {
    const projName = inv.quotation?.projectName || 'Operations';
    if (!projMap[projName]) {
      projMap[projName] = { name: projName, rev: 0, exp: 0, received: 0, pending: 0 };
    }
    projMap[projName].rev += Number(inv.grandTotal);
    projMap[projName].received += Number(inv.amountPaid);
    projMap[projName].pending += (Number(inv.grandTotal) - Number(inv.amountPaid));
  });
  allExpenses.forEach(exp => {
    const projName = exp.project || 'Operations';
    if (!projMap[projName]) {
      projMap[projName] = { name: projName, rev: 0, exp: 0, received: 0, pending: 0 };
    }
    projMap[projName].exp += Number(exp.amount);
  });
  const projectProfitability = Object.keys(projMap).map(key => {
    const p = projMap[key];
    const profit = p.rev - p.exp;
    const margin = p.rev > 0 ? Number(((profit / p.rev) * 100).toFixed(1)) : 0;
    const roi = p.exp > 0 ? Number((p.rev / p.exp).toFixed(1)) : 1.0;
    return {
      id: key.replace(/\s+/g, '-').toLowerCase(),
      name: p.name,
      rev: p.rev,
      exp: p.exp,
      profit,
      margin,
      received: p.received,
      pending: p.pending,
      roi
    };
  });

  // 9. Calculate Monthly Fixed Costs dynamically (strictly using real records)
  const allPayroll = await Payroll.findAll({ where: { tenantId } });
  const fixedCostsList = [];
  allPayroll.forEach(p => {
    fixedCostsList.push({
      name: `Salary: ${p.employeeName} (${p.department})`,
      cost: Number(p.salary),
      due: new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      prio: p.priority || 'high'
    });
  });
  subscriptions.forEach(sub => {
    const monthlyCost = sub.billingCycle === 'monthly' ? Number(sub.cost) : Number(sub.cost) / 12;
    fixedCostsList.push({
      name: sub.name,
      cost: Math.round(monthlyCost),
      due: `In ${Math.max(1, Math.ceil((new Date(sub.renewalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days`,
      prio: monthlyCost > 15000 ? 'high' : monthlyCost > 5000 ? 'medium' : 'low'
    });
  });
  const rentLiab = pendingLiabilities.find(l => l.category === 'Rent');
  if (rentLiab) {
    fixedCostsList.push({ 
      name: rentLiab.title, 
      cost: Number(rentLiab.amount), 
      due: `In ${Math.max(1, Math.ceil((new Date(rentLiab.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days`, 
      prio: 'high' 
    });
  }

  // Calculate dynamic average collection days
  const paidInvoices = invoicesList.filter(inv => inv.status === 'paid');
  let averageCollectionDays = 0;
  if (paidInvoices.length > 0) {
    let totalDays = 0;
    paidInvoices.forEach(inv => {
      const issue = new Date(inv.issueDate);
      const paid = new Date(inv.updatedAt);
      const diffTime = Math.abs(paid.getTime() - issue.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      totalDays += diffDays;
    });
    averageCollectionDays = Math.round(totalDays / paidInvoices.length);
  }

  // Calculate dynamic expense growth rate
  let expenseGrowth = 0;
  if (prev30DaysExpense > 0) {
    expenseGrowth = Number((((last30DaysExpense - prev30DaysExpense) / prev30DaysExpense) * 100).toFixed(1));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      kpis: {
        companyBalance,
        availableCash,
        pendingRevenue,
        pendingExpenses: totalPendingLiabilities + totalPendingPayroll,
        monthlyRevenue: last30DaysIncome,
        monthlyExpenses: last30DaysExpense,
        netProfit,
        cashReserve: companyBalance,
        burnRate,
        runway: runwayMonths,
        criticalLiabilities: criticalLiabilitiesCount,
        upcomingPayroll: upcomingPayrollAmount,
        taxesDue,
        profitMargin,
        expenseGrowth,
        averageCollectionDays,
        upcomingRenewals: upcomingRenewalsCount,
        subscriptionCostMonthly,
        revenueGrowth,
        balanceGrowth
      },
      revenueSourcesPie,
      projectProfitability,
      fixedCostsList
    }
  });
});

/**
 * GET /api/v1/finance/cashflow
 */
const getCashFlowHistory = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { range = '30D' } = req.query; // 7D, 30D, 3M, 6M, 1Y

  const transactions = await Transaction.findAll({
    where: { tenantId },
    order: [['date', 'ASC']]
  });

  const invoicesList = await Invoice.findAll({ where: { tenantId } });

  // Group by date
  let intervals = [];
  const now = new Date();

  if (range === '7D') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      intervals.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), dateStr: d.toISOString().split('T')[0], income: 0, expenses: 0 });
    }
  } else if (range === '30D') {
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i * 7);
      intervals.push({ label: `Wk ${5-i}`, dateStr: d.toISOString().split('T')[0], income: 0, expenses: 0 });
    }
  } else {
    // 3M, 6M, 1Y
    const limit = range === '3M' ? 3 : range === '6M' ? 6 : 12;
    for (let i = limit - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(now.getMonth() - i);
      intervals.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), dateStr: d.toISOString().split('T')[0], income: 0, expenses: 0 });
    }
  }

  // Populate data
  let runningBalance = 0; // base cash reserve from ledger
  intervals = intervals.map((interval, idx) => {
    const nextInterval = intervals[idx + 1];
    const startDate = new Date(interval.dateStr);
    const endDate = nextInterval ? new Date(nextInterval.dateStr) : new Date(Date.now() + 1000 * 60 * 60 * 24);

    let inc = 0;
    let exp = 0;

    transactions.forEach(t => {
      const tDate = new Date(t.date);
      if (tDate >= startDate && tDate < endDate) {
        const amt = Number(t.amount);
        if (t.type === 'income') {
          inc += amt;
        } else {
          exp += Math.abs(amt);
        }
      }
    });

    invoicesList.forEach(inv => {
      const invDate = new Date(inv.updatedAt || inv.issueDate);
      if (invDate >= startDate && invDate < endDate) {
        inc += Number(inv.amountPaid);
      }
    });

    runningBalance += (inc - exp);

    return {
      name: interval.label,
      income: inc,
      expenses: exp,
      cashBalance: runningBalance,
      projectedCash: runningBalance * 1.05 // forecast simulation
    };
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: intervals
  });
});

/**
 * GET /api/v1/finance/sankey
 */
const getSankeyData = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const expenses = await Expense.findAll({ where: { tenantId } });
  const transactions = await Transaction.findAll({ where: { tenantId, type: 'income' } });
  const payrollList = await Payroll.findAll({ where: { tenantId } });

  const invoicesList = await Invoice.findAll({ where: { tenantId } });
  const totalInvoiceRevenue = invoicesList.reduce((sum, inv) => sum + Number(inv.amountPaid), 0);
  const totalRevenue = totalInvoiceRevenue + transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const totalSalaries = payrollList.reduce((sum, p) => sum + Number(p.salary), 0);

  // Group expenses by category
  let office = 0;
  let cloud = 0;
  let marketing = 0;
  let taxes = 0;
  let other = 0;

  expenses.forEach(e => {
    const amt = Number(e.amount);
    if (e.category === 'Office' || e.category === 'Rent') office += amt;
    else if (e.category === 'Cloud') cloud += amt;
    else if (e.category === 'Marketing') marketing += amt;
    else if (e.category === 'Taxes') taxes += amt;
    else other += amt;
  });

  const totalExpense = totalSalaries + office + cloud + marketing + taxes + other;
  const remainingCash = Math.max(0, totalRevenue - totalExpense);

  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      nodes: [
        { name: 'Total Revenue' },      // 0
        { name: 'Company Wallet' },     // 1
        { name: 'Salaries & Bonus' },  // 2
        { name: 'Office & Rent' },     // 3
        { name: 'Cloud Infrastructure' }, // 4
        { name: 'Marketing & Ads' },   // 5
        { name: 'Corporate Taxes' },    // 6
        { name: 'Remaining Cash' }     // 7
      ],
      links: [
        { source: 0, target: 1, value: totalRevenue },
        { source: 1, target: 2, value: totalSalaries },
        { source: 1, target: 3, value: office },
        { source: 1, target: 4, value: cloud },
        { source: 1, target: 5, value: marketing },
        { source: 1, target: 6, value: taxes },
        { source: 1, target: 7, value: remainingCash }
      ]
    }
  });
});

/**
 * GET /api/v1/finance/calendar
 */
const getFinancialCalendarEvents = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;

  const liabilities = await Liability.findAll({ where: { tenantId, status: 'pending' } });
  const payrollList = await Payroll.findAll({ where: { tenantId, status: 'pending' } });
  const subscriptions = await Subscription.findAll({ where: { tenantId, status: 'active' } });

  const events = [];

  liabilities.forEach(liab => {
    events.push({
      id: `liab-${liab.id}`,
      title: `Liability Payment: ${liab.title}`,
      date: liab.dueDate,
      amount: Number(liab.amount),
      type: 'liability',
      priority: liab.priority
    });
  });

  payrollList.forEach(p => {
    events.push({
      id: `pay-${p.id}`,
      title: `Salary Payout: ${p.employeeName}`,
      date: p.dueDate,
      amount: Number(p.pending),
      type: 'payroll',
      priority: p.priority
    });
  });

  subscriptions.forEach(s => {
    events.push({
      id: `sub-${s.id}`,
      title: `Renewal: ${s.name}`,
      date: s.renewalDate,
      amount: Number(s.cost),
      type: 'subscription',
      priority: 'low'
    });
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: events
  });
});

/**
 * AI Financial Copilot conversational assistant using Groq
 */
const getCopilotResponse = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { question } = req.body;

  if (!question) {
    throw new ValidationError('A question is required');
  }

  // 1. Gather all database context to build prompt
  const [
    kpisResult,
    liabilities,
    subscriptions,
    payrollList,
    invoices,
    recentExpenses
  ] = await Promise.all([
    Transaction.findAll({ where: { tenantId } }),
    Liability.findAll({ where: { tenantId, status: 'pending' } }),
    Subscription.findAll({ where: { tenantId, status: 'active' } }),
    Payroll.findAll({ where: { tenantId } }),
    Invoice.findAll({ where: { tenantId, status: { [Op.ne]: 'paid' } }, include: [{ model: Customer, as: 'customer' }] }),
    Expense.findAll({ where: { tenantId }, order: [['expenseDate', 'DESC']], limit: 5 })
  ]);

  // Aggregate KPI summary for prompt context
  let totalRev = 0;
  let totalExp = 0;
  invoices.forEach(i => {
    totalRev += (Number(i.grandTotal) - Number(i.amountPaid));
  });
  liabilities.forEach(l => {
    totalExp += Number(l.amount);
  });
  payrollList.forEach(p => {
    if (p.status !== 'paid') totalExp += Number(p.pending);
  });

  const overdueInvoices = invoices.filter(i => i.status === 'overdue' || new Date(i.dueDate) < new Date());
  const maxDebtor = invoices.reduce((max, curr) => {
    const due = Number(curr.grandTotal) - Number(curr.amountPaid);
    const maxDue = max ? Number(max.grandTotal) - Number(max.amountPaid) : 0;
    return due > maxDue ? curr : max;
  }, null);

  const contextString = `
Current Financial System State Context:
- Pending Revenue (Unpaid Invoices): ₹${totalRev.toLocaleString('en-IN')}
- Overdue Invoices: ${overdueInvoices.length} invoices.
${maxDebtor ? `- Highest Debtor: ${maxDebtor.customer?.name} (Owes: ₹${(Number(maxDebtor.grandTotal) - Number(maxDebtor.amountPaid)).toLocaleString('en-IN')}, Invoice: ${maxDebtor.invoiceNumber}, Due: ${new Date(maxDebtor.dueDate).toLocaleDateString()})` : '- Highest Debtor: None'}
- Pending Liabilities: ₹${totalExp.toLocaleString('en-IN')} across ${liabilities.length} vendor bills.
- Subscriptions Active: ${subscriptions.length} subscriptions, costing approximately ₹${subscriptions.reduce((s, c) => s + Number(c.cost), 0).toLocaleString('en-IN')} monthly.
- Active subscriptions: ${subscriptions.map(s => `${s.name} (₹${s.cost})`).join(', ')}.
- Payroll Status: ${payrollList.filter(p => p.status !== 'paid').length} employees pending salary, totaling ₹${payrollList.reduce((s, p) => s + Number(p.pending), 0).toLocaleString('en-IN')}.
- Recent recorded expenses: ${recentExpenses.map(r => `${r.title} (₹${r.amount} for ${r.category})`).join(', ')}.
`;

  if (!env.GROQ_API_KEY) {
    // Graceful fallback response if key is missing
    return res.status(StatusCodes.OK).json({
      success: true,
      data: `I parsed your query: "${question}". However, the Groq LLM API Key is not configured in the backend environment. 
      Here is your live dashboard context instead:\n\n${contextString}`
    });
  }

  // Call Groq API
  try {
    const payload = {
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are Quotiq AI's premium Financial Copilot chatbot, a trusted assistant to CFOs and business owners.
You have access to the real-time financial database of the company. Answer questions clearly, professionally, and concisely using the provided context.
Use Rupees currency (₹) in responses. Format important numbers in bold. Keep answers under 3-4 sentences when possible.

${contextString}`
        },
        {
          role: 'user',
          content: question
        }
      ],
      temperature: 0.2
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Groq API returned status ${response.status}`);
    }

    const json = await response.json();
    const answer = json.choices?.[0]?.message?.content || 'I encountered an error analyzing this financial query.';

    res.status(StatusCodes.OK).json({
      success: true,
      data: answer
    });
  } catch (error) {
    logger.error({ error }, 'Groq Financial Copilot call failed');
    res.status(StatusCodes.OK).json({
      success: true,
      data: `I was unable to connect to the AI copilot model. However, here is the live database status matching your inquiry:\n\n${contextString}`
    });
  }
});

// ── EXPENSE CRUD ─────────────────────────────────────────────

const listExpenses = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { category, search, page = 1, limit = 10 } = req.query;

  const where = { tenantId };
  if (category) {
    where.category = category;
  }
  if (search) {
    where.title = { [Op.iLike]: `%${search}%` };
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await Expense.findAndCountAll({
    where,
    order: [['expenseDate', 'DESC']],
    offset,
    limit: Number(limit)
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: rows,
    meta: {
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit)
    }
  });
});

const createExpense = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const input = req.body;

  const expense = await Expense.create({
    ...input,
    tenantId
  });

  // Create corresponding transaction
  await Transaction.create({
    tenantId,
    type: 'expense',
    description: `Expense: ${expense.title} paid to ${expense.vendor || 'Vendor'}`,
    category: expense.category,
    amount: -Number(expense.amount),
    status: expense.approvalStatus === 'approved' ? 'paid' : 'pending',
    date: expense.expenseDate,
    referenceId: expense.id
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: expense,
    message: 'Expense recorded successfully'
  });
});

const updateExpense = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const input = req.body;

  const expense = await Expense.findOne({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Expense');

  await expense.update(input);

  // Sync existing transaction if any
  const tx = await Transaction.findOne({ where: { tenantId, referenceId: id } });
  if (tx) {
    await tx.update({
      description: `Expense: ${expense.title} paid to ${expense.vendor || 'Vendor'}`,
      category: expense.category,
      amount: -Number(expense.amount),
      status: expense.approvalStatus === 'approved' ? 'paid' : 'pending',
      date: expense.expenseDate
    });
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: expense,
    message: 'Expense updated successfully'
  });
});

const deleteExpense = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const expense = await Expense.findOne({ where: { id, tenantId } });
  if (!expense) throw new NotFoundError('Expense');

  await expense.destroy();
  await Transaction.destroy({ where: { tenantId, referenceId: id } });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Expense deleted successfully'
  });
});

// ── LIABILITY CRUD ───────────────────────────────────────────

const listLiabilities = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const liabilities = await Liability.findAll({
    where: { tenantId },
    order: [['dueDate', 'ASC']]
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: liabilities
  });
});

const createLiability = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const input = req.body;

  const liability = await Liability.create({
    ...input,
    tenantId
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: liability,
    message: 'Liability recorded successfully'
  });
});

const updateLiability = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const input = req.body;

  const liability = await Liability.findOne({ where: { id, tenantId } });
  if (!liability) throw new NotFoundError('Liability');

  await liability.update(input);

  // If status changed to completed, log a paid transaction!
  if (input.status === 'completed') {
    const existingTx = await Transaction.findOne({ where: { tenantId, referenceId: id } });
    if (!existingTx) {
      await Transaction.create({
        tenantId,
        type: 'vendor',
        description: `Settled Liability: ${liability.title} to ${liability.vendor}`,
        category: liability.category,
        amount: -Number(liability.amount),
        status: 'paid',
        date: new Date(),
        referenceId: id
      });
    }
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: liability,
    message: 'Liability updated successfully'
  });
});

const deleteLiability = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const liability = await Liability.findOne({ where: { id, tenantId } });
  if (!liability) throw new NotFoundError('Liability');

  await liability.destroy();
  await Transaction.destroy({ where: { tenantId, referenceId: id } });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Liability deleted successfully'
  });
});

// ── SUBSCRIPTION CRUD ────────────────────────────────────────

const listSubscriptions = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const subs = await Subscription.findAll({
    where: { tenantId },
    order: [['renewalDate', 'ASC']]
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: subs
  });
});

const createSubscription = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const input = req.body;

  const sub = await Subscription.create({
    ...input,
    tenantId
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: sub,
    message: 'Subscription tracked successfully'
  });
});

const updateSubscription = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const input = req.body;

  const sub = await Subscription.findOne({ where: { id, tenantId } });
  if (!sub) throw new NotFoundError('Subscription');

  await sub.update(input);

  res.status(StatusCodes.OK).json({
    success: true,
    data: sub,
    message: 'Subscription updated successfully'
  });
});

const deleteSubscription = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const sub = await Subscription.findOne({ where: { id, tenantId } });
  if (!sub) throw new NotFoundError('Subscription');

  await sub.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Subscription deleted successfully'
  });
});

// ── PAYROLL CRUD ─────────────────────────────────────────────

const listPayroll = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const payrollList = await Payroll.findAll({
    where: { tenantId },
    order: [['employeeName', 'ASC']]
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: payrollList
  });
});

const createPayroll = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const input = req.body;

  const payroll = await Payroll.create({
    ...input,
    tenantId
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: payroll,
    message: 'Payroll entry created'
  });
});

const recordSalaryPayment = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const { transactionReference, notes, paymentMethod, amountPaid } = req.body;

  const payroll = await Payroll.findOne({ where: { id, tenantId } });
  if (!payroll) throw new NotFoundError('Payroll employee');

  const payAmt = Number(amountPaid || payroll.pending);

  await payroll.update({
    pending: Math.max(0, Number(payroll.pending) - payAmt),
    paid: Number(payroll.paid) + payAmt,
    status: Number(payroll.pending) - payAmt <= 0 ? 'paid' : 'partially_paid'
  });

  // Log as transaction ledger entry
  await Transaction.create({
    tenantId,
    type: 'salary',
    description: `Salary Payout: ${payroll.employeeName} (${notes || 'Monthly Payout'})`,
    category: 'Salaries',
    amount: -payAmt,
    status: 'paid',
    date: new Date(),
    referenceId: id
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: payroll,
    message: 'Salary payment recorded successfully'
  });
});

const listLedgerTransactions = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const list = await Transaction.findAll({
    where: { tenantId },
    order: [['date', 'DESC']]
  });
  res.status(StatusCodes.OK).json({
    success: true,
    data: list,
    message: 'Ledger transactions retrieved successfully'
  });
});

const updatePayroll = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const input = req.body;

  const payroll = await Payroll.findOne({ where: { id, tenantId } });
  if (!payroll) throw new NotFoundError('Payroll employee record');

  await payroll.update(input);

  res.status(StatusCodes.OK).json({
    success: true,
    data: payroll,
    message: 'Payroll record updated successfully'
  });
});

const deletePayroll = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const payroll = await Payroll.findOne({ where: { id, tenantId } });
  if (!payroll) throw new NotFoundError('Payroll employee record');

  await payroll.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Payroll record deleted successfully'
  });
});

const clearFinanceData = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  await Expense.destroy({ where: { tenantId } });
  await Liability.destroy({ where: { tenantId } });
  await Subscription.destroy({ where: { tenantId } });
  await Payroll.destroy({ where: { tenantId } });
  await Transaction.destroy({ where: { tenantId } });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'All ledger logs, subscriptions, payrolls, liabilities, and expenses have been cleared successfully'
  });
});

module.exports = {
  triggerSeed,
  getFinanceSummary,
  getCashFlowHistory,
  getSankeyData,
  getFinancialCalendarEvents,
  getCopilotResponse,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  listLiabilities,
  createLiability,
  updateLiability,
  deleteLiability,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listPayroll,
  createPayroll,
  recordSalaryPayment,
  listLedgerTransactions,
  updatePayroll,
  deletePayroll,
  clearFinanceData
};
