const { Expense, Liability, Subscription, Payroll, Transaction } = require('../models/index.js');
const { logger } = require('./logger.js');

async function seedFinanceData(tenantId) {
  try {
    // Check if data already exists for this tenant
    const expenseCount = await Expense.count({ where: { tenantId } });
    if (expenseCount > 0) {
      logger.info(`Finance data already seeded for tenant: ${tenantId}`);
      return;
    }

    logger.info(`🌱 Seeding finance data for tenant: ${tenantId}...`);

    // 1. Seed Subscriptions
    const subData = [
      { name: 'AWS Cloud Infrastructure', cost: 18000.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), status: 'active', description: 'Production and staging environment hosting' },
      { name: 'Google Workspace', cost: 6000.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), status: 'active', description: 'Company emails and drive storage' },
      { name: 'OpenAI API Client', cost: 4500.0, billingCycle: 'monthly', autoRenewal: false, renewalDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), status: 'active', description: 'LLM features token usage' },
      { name: 'Claude (Anthropic)', cost: 3200.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), status: 'active', description: 'AI writing and code helper' },
      { name: 'Vercel Pro', cost: 2000.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), status: 'active', description: 'Frontend deployment & hosting' },
      { name: 'MongoDB Atlas', cost: 3200.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), status: 'active', description: 'Shared database cluster' },
      { name: 'Slack Enterprise', cost: 8500.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), status: 'active', description: 'Internal team communication' },
      { name: 'GitHub Enterprise', cost: 5000.0, billingCycle: 'monthly', autoRenewal: true, renewalDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), status: 'active', description: 'Code repositories and actions CI/CD' },
      { name: 'Notion Workspace', cost: 4000.0, billingCycle: 'annual', autoRenewal: true, renewalDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), status: 'active', description: 'Knowledge base and project documentation' },
      { name: 'SSL & Domain Renewals', cost: 1200.0, billingCycle: 'annual', autoRenewal: true, renewalDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), status: 'active', description: 'Security certifications for main domain' }
    ];

    const subscriptions = await Promise.all(
      subData.map(sub => Subscription.create({ ...sub, tenantId }))
    );

    // 2. Seed Payroll
    const payrollData = [
      { employeeName: 'Siddharth Sharma', department: 'Engineering', salary: 95000.0, bonus: 10000.0, pending: 0, paid: 105000.0, dueDate: new Date(), paymentMode: 'bank_transfer', status: 'paid', priority: 'high', notes: 'Monthly payroll + performance bonus' },
      { employeeName: 'Priya Patel', department: 'Product Design', salary: 75000.0, bonus: 0, pending: 0, paid: 75000.0, dueDate: new Date(), paymentMode: 'bank_transfer', status: 'paid', priority: 'high', notes: 'Monthly payroll' },
      { employeeName: 'Rahul Verma', department: 'Marketing', salary: 45000.0, bonus: 5000.0, pending: 0, paid: 50000.0, dueDate: new Date(), paymentMode: 'upi', status: 'paid', priority: 'medium', notes: 'Content strategy lead salary' },
      { employeeName: 'Ananya Iyer', department: 'Sales', salary: 55000.0, bonus: 15000.0, pending: 70000.0, paid: 0, dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), paymentMode: 'bank_transfer', status: 'pending', priority: 'high', notes: 'Includes Q2 commission payout' },
      { employeeName: 'Kabir Mehta', department: 'Engineering', salary: 85000.0, bonus: 0, pending: 85000.0, paid: 0, dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), paymentMode: 'bank_transfer', status: 'pending', priority: 'critical', notes: 'Senior Developer monthly salary' }
    ];

    const payrolls = await Promise.all(
      payrollData.map(pay => Payroll.create({ ...pay, tenantId }))
    );

    // 3. Seed Liabilities
    const liabilityData = [
      { title: 'Corporate Tax Payout Q2', vendor: 'Income Tax Dept', category: 'Taxes', amount: 185000.0, dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), recurring: false, repeatInterval: 'none', priority: 'critical', reminderDays: 5, assignedTo: 'Alex Rivera', paymentMethod: 'bank_transfer', notes: 'GST and corporate tax estimation', status: 'pending' },
      { title: 'Office Space Rental - H1', vendor: 'DLF CyberCity Properties', category: 'Rent', amount: 140000.0, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), recurring: true, repeatInterval: 'monthly', priority: 'high', reminderDays: 7, assignedTo: 'Alex Rivera', paymentMethod: 'bank_transfer', notes: 'Monthly office rent installment', status: 'pending' },
      { title: 'Server Loan Installment', vendor: 'HDFC Bank Corporate Loan', category: 'EMI', amount: 95000.0, dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), recurring: true, repeatInterval: 'monthly', priority: 'medium', reminderDays: 3, assignedTo: 'Alex Rivera', paymentMethod: 'bank_transfer', notes: 'Equipment loan monthly EMI', status: 'pending' },
      { title: 'Freelancer Dev Retainer', vendor: 'Dev Freelance Agency', category: 'Software', amount: 55000.0, dueDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000), recurring: true, repeatInterval: 'monthly', priority: 'low', reminderDays: 2, assignedTo: 'Siddharth Sharma', paymentMethod: 'bank_transfer', notes: 'Contract deliverables for main builder', status: 'pending' }
    ];

    const liabilities = await Promise.all(
      liabilityData.map(liab => Liability.create({ ...liab, tenantId }))
    );

    // 4. Seed Expenses
    const expenseData = [
      { title: 'Office Rent - May 2026', category: 'Office', vendor: 'DLF CyberCity Properties', employee: 'Alex Rivera', project: 'General Operations', department: 'Operations', amount: 50000.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'bank_transfer', recurring: true, priority: 'critical', expenseDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), invoiceNumber: 'DLF-RENT-590', description: 'Rent for corporate headquarters', approvalStatus: 'approved' },
      { title: 'AWS Cloud Payout - May', category: 'Cloud', vendor: 'Amazon Web Services', employee: 'Siddharth Sharma', project: 'Website Redesign', department: 'Engineering', amount: 18000.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'card', recurring: true, priority: 'high', expenseDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), invoiceNumber: 'AWS-INV-992', description: 'Staging and production nodes', approvalStatus: 'approved' },
      { title: 'Office Broadband Internet', category: 'Internet', vendor: 'Airtel Enterprise', employee: 'Alex Rivera', project: 'General Operations', department: 'Operations', amount: 5000.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'upi', recurring: true, priority: 'medium', expenseDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), invoiceNumber: 'AIRTEL-4819', description: '1Gbps dedicated leased line', approvalStatus: 'approved' },
      { title: 'Google Workspace - May', category: 'Software', vendor: 'Google Suite', employee: 'Alex Rivera', project: 'General Operations', department: 'Operations', amount: 6000.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'card', recurring: true, priority: 'medium', expenseDate: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000), invoiceNumber: 'GSUITE-3920', description: 'Enterprise seats for 12 employees', approvalStatus: 'approved' },
      { title: 'MongoDB Atlas - May', category: 'Cloud', vendor: 'MongoDB Inc', employee: 'Siddharth Sharma', project: 'Website Redesign', department: 'Engineering', amount: 3200.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'card', recurring: true, priority: 'medium', expenseDate: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000), invoiceNumber: 'MONGO-389', description: 'M10 Dedicated cluster', approvalStatus: 'approved' },
      { title: 'Notion Workspace Annual', category: 'Software', vendor: 'Notion Labs', employee: 'Priya Patel', project: 'General Operations', department: 'Product Design', amount: 12000.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'card', recurring: false, priority: 'low', expenseDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), invoiceNumber: 'NOTION-892', description: 'Notion doc collaboration workspace', approvalStatus: 'approved' },
      { title: 'Software Engineering Hiring Ads', category: 'Marketing', vendor: 'LinkedIn Ads', employee: 'Alex Rivera', project: 'Hiring', department: 'HR', amount: 15000.0, gst: 18.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'card', recurring: false, priority: 'medium', expenseDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), invoiceNumber: 'LNKD-9918', description: 'Hiring pipeline advertisements', approvalStatus: 'approved' },
      { title: 'Team Dinner - Project Kickoff', category: 'Travel', vendor: 'Radisson Food Plaza', employee: 'Rahul Verma', project: 'Mobile App-Dev', department: 'Marketing', amount: 8500.0, gst: 5.0, currency: 'INR', exchangeRate: 1.0, paymentMethod: 'cash', recurring: false, priority: 'low', expenseDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), invoiceNumber: 'RAD-3920', description: 'Mobile app project team celebration dinner', approvalStatus: 'approved' }
    ];

    const expenses = await Promise.all(
      expenseData.map(exp => Expense.create({ ...exp, tenantId }))
    );

    // 5. Seed Transactions (unified history)
    const transactionData = [
      { type: 'income', description: 'Project milestones payment from Global Tech Solutions', category: 'Project Payment', amount: 245000.0, status: 'received', date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      { type: 'income', description: 'Retainer deposit from Starlight Industries', category: 'Project Payment', amount: 180000.0, status: 'received', date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000) },
      { type: 'income', description: 'Monthly maintenance payment from Apex Logistics', category: 'Maintenance', amount: 150000.0, status: 'received', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
      { type: 'income', description: 'Consulting fees from TechGlobal HQ', category: 'Consulting', amount: 135000.0, status: 'received', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      { type: 'income', description: 'AMC renewal from Luminia Systems', category: 'AMC', amount: 80000.0, status: 'received', date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
      
      { type: 'expense', description: 'Office headquarters monthly rent payout', category: 'Office', amount: -50000.0, status: 'paid', date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      { type: 'expense', description: 'AWS infrastructure monthly billing', category: 'Cloud', amount: -18000.0, status: 'paid', date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
      { type: 'expense', description: 'Dedicated office internet bill Airtel', category: 'Internet', amount: -5000.0, status: 'paid', date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      { type: 'expense', description: 'LinkedIn recruiter seat advertising campaign', category: 'Marketing', amount: -15000.0, status: 'paid', date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
      
      { type: 'salary', description: 'Siddharth Sharma salary - May 2026', category: 'Salaries', amount: -105000.0, status: 'paid', date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      { type: 'salary', description: 'Priya Patel salary - May 2026', category: 'Salaries', amount: -75000.0, status: 'paid', date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      { type: 'salary', description: 'Rahul Verma salary - May 2026', category: 'Salaries', amount: -50000.0, status: 'paid', date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
    ];

    const transactions = await Promise.all(
      transactionData.map(tx => Transaction.create({ ...tx, tenantId }))
    );

    logger.info(`✅ Seeded ${subscriptions.length} Subscriptions, ${payrolls.length} Payroll entries, ${liabilities.length} Liabilities, ${expenses.length} Expenses, and ${transactions.length} Transactions.`);
  } catch (error) {
    logger.error({ error }, '❌ Failed to seed finance database records');
  }
}

module.exports = {
  seedFinanceData
};
