const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware.js');
const financeController = require('../controllers/finance.controller.js');

const router = Router();

// Apply auth middleware to all finance routes
router.use(authenticate);

// KPI & Analytical routes
router.get('/summary', financeController.getFinanceSummary);
router.get('/cashflow', financeController.getCashFlowHistory);
router.get('/sankey', financeController.getSankeyData);
router.get('/calendar', financeController.getFinancialCalendarEvents);
router.get('/ledger', financeController.listLedgerTransactions);
router.post('/copilot', financeController.getCopilotResponse);
router.post('/seed', financeController.triggerSeed);

// Expenses routes
router.get('/expenses', financeController.listExpenses);
router.post('/expenses', financeController.createExpense);
router.put('/expenses/:id', financeController.updateExpense);
router.delete('/expenses/:id', financeController.deleteExpense);

// Liabilities routes
router.get('/liabilities', financeController.listLiabilities);
router.post('/liabilities', financeController.createLiability);
router.put('/liabilities/:id', financeController.updateLiability);
router.delete('/liabilities/:id', financeController.deleteLiability);

// Subscriptions routes
router.get('/subscriptions', financeController.listSubscriptions);
router.post('/subscriptions', financeController.createSubscription);
router.put('/subscriptions/:id', financeController.updateSubscription);
router.delete('/subscriptions/:id', financeController.deleteSubscription);

// Payroll routes
router.get('/payroll', financeController.listPayroll);
router.post('/payroll', financeController.createPayroll);
router.put('/payroll/:id', financeController.updatePayroll);
router.delete('/payroll/:id', financeController.deletePayroll);
router.post('/payroll/:id/pay', financeController.recordSalaryPayment);

// Clear data route
router.delete('/clear', financeController.clearFinanceData);

module.exports = router;
