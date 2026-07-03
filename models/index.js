import { Organization } from './organization.model.js';
import { User, Role } from './user.model.js';
import { RefreshToken } from './refresh-token.model.js';
import { Department } from './department.model.js';
import { Customer } from './customer.model.js';
import { CustomerAddress } from './customer-address.model.js';
import { Product } from './product.model.js';
import { Service } from './service.model.js';
import { Quotation } from './quotation.model.js';
import { QuotationSection } from './quotation-section.model.js';
import { QuotationItem } from './quotation-item.model.js';
import { Invoice } from './invoice.model.js';
import { InvoiceItem } from './invoice-item.model.js';
import { Payment } from './payment.model.js';
import { OfferLetter } from './offer-letter.model.js';
import { Expense } from './expense.model.js';
import { Liability } from './liability.model.js';
import { Subscription } from './subscription.model.js';
import { Payroll } from './payroll.model.js';
import { Transaction } from './transaction.model.js';

export function registerAssociations() {
  // Organization ↔ User
  Organization.hasMany(User, {
    foreignKey: 'tenantId',
    as: 'users',
    onDelete: 'CASCADE',
  });
  User.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // User ↔ RefreshToken
  User.hasMany(RefreshToken, {
    foreignKey: 'userId',
    as: 'refreshTokens',
    onDelete: 'CASCADE',
  });
  RefreshToken.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
  });

  // Organization ↔ Department
  Organization.hasMany(Department, {
    foreignKey: 'tenantId',
    as: 'departments',
    onDelete: 'CASCADE',
  });
  Department.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Department ↔ Customer
  Department.hasMany(Customer, {
    foreignKey: 'departmentId',
    as: 'customers',
    onDelete: 'SET NULL',
  });
  Customer.belongsTo(Department, {
    foreignKey: 'departmentId',
    as: 'department',
  });

  // Organization ↔ Customer
  Organization.hasMany(Customer, {
    foreignKey: 'tenantId',
    as: 'customers',
    onDelete: 'CASCADE',
  });
  Customer.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Customer ↔ CustomerAddress
  Customer.hasMany(CustomerAddress, {
    foreignKey: 'customerId',
    as: 'addresses',
    onDelete: 'CASCADE',
  });
  CustomerAddress.belongsTo(Customer, {
    foreignKey: 'customerId',
    as: 'customer',
  });

  // Organization ↔ Product
  Organization.hasMany(Product, {
    foreignKey: 'tenantId',
    as: 'products',
    onDelete: 'CASCADE',
  });
  Product.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Service
  Organization.hasMany(Service, {
    foreignKey: 'tenantId',
    as: 'services',
    onDelete: 'CASCADE',
  });
  Service.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Quotation
  Organization.hasMany(Quotation, {
    foreignKey: 'tenantId',
    as: 'quotations',
    onDelete: 'CASCADE',
  });
  Quotation.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Customer ↔ Quotation
  Customer.hasMany(Quotation, {
    foreignKey: 'customerId',
    as: 'quotations',
  });
  Quotation.belongsTo(Customer, {
    foreignKey: 'customerId',
    as: 'customer',
  });

  // Department ↔ Quotation
  Department.hasMany(Quotation, {
    foreignKey: 'departmentId',
    as: 'quotations',
  });
  Quotation.belongsTo(Department, {
    foreignKey: 'departmentId',
    as: 'department',
  });

  // Quotation ↔ QuotationSection
  Quotation.hasMany(QuotationSection, {
    foreignKey: 'quotationId',
    as: 'sections',
    onDelete: 'CASCADE',
  });
  QuotationSection.belongsTo(Quotation, {
    foreignKey: 'quotationId',
    as: 'quotation',
  });

  // QuotationSection ↔ QuotationItem
  QuotationSection.hasMany(QuotationItem, {
    foreignKey: 'sectionId',
    as: 'items',
    onDelete: 'CASCADE',
  });
  QuotationItem.belongsTo(QuotationSection, {
    foreignKey: 'sectionId',
    as: 'section',
  });

  // Product ↔ QuotationItem
  Product.hasMany(QuotationItem, {
    foreignKey: 'productId',
    as: 'quotationItems',
  });
  QuotationItem.belongsTo(Product, {
    foreignKey: 'productId',
    as: 'product',
  });

  // Service ↔ QuotationItem
  Service.hasMany(QuotationItem, {
    foreignKey: 'serviceId',
    as: 'quotationItems',
  });
  QuotationItem.belongsTo(Service, {
    foreignKey: 'serviceId',
    as: 'service',
  });

  // Organization ↔ Invoice
  Organization.hasMany(Invoice, {
    foreignKey: 'tenantId',
    as: 'invoices',
    onDelete: 'CASCADE',
  });
  Invoice.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Quotation ↔ Invoice
  Quotation.hasMany(Invoice, {
    foreignKey: 'quotationId',
    as: 'invoices',
  });
  Invoice.belongsTo(Quotation, {
    foreignKey: 'quotationId',
    as: 'quotation',
  });

  // Customer ↔ Invoice
  Customer.hasMany(Invoice, {
    foreignKey: 'customerId',
    as: 'invoices',
  });
  Invoice.belongsTo(Customer, {
    foreignKey: 'customerId',
    as: 'customer',
  });

  // Invoice ↔ InvoiceItem
  Invoice.hasMany(InvoiceItem, {
    foreignKey: 'invoiceId',
    as: 'items',
    onDelete: 'CASCADE',
  });
  InvoiceItem.belongsTo(Invoice, {
    foreignKey: 'invoiceId',
    as: 'invoice',
  });

  // Invoice ↔ Payment
  Invoice.hasMany(Payment, {
    foreignKey: 'invoiceId',
    as: 'payments',
    onDelete: 'CASCADE',
  });
  Payment.belongsTo(Invoice, {
    foreignKey: 'invoiceId',
    as: 'invoice',
  });

  // Organization ↔ OfferLetter
  Organization.hasMany(OfferLetter, {
    foreignKey: 'tenantId',
    as: 'offerLetters',
    onDelete: 'CASCADE',
  });
  OfferLetter.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Expense
  Organization.hasMany(Expense, {
    foreignKey: 'tenantId',
    as: 'expenses',
    onDelete: 'CASCADE',
  });
  Expense.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Liability
  Organization.hasMany(Liability, {
    foreignKey: 'tenantId',
    as: 'liabilities',
    onDelete: 'CASCADE',
  });
  Liability.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Subscription
  Organization.hasMany(Subscription, {
    foreignKey: 'tenantId',
    as: 'subscriptions',
    onDelete: 'CASCADE',
  });
  Subscription.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Payroll
  Organization.hasMany(Payroll, {
    foreignKey: 'tenantId',
    as: 'payroll',
    onDelete: 'CASCADE',
  });
  Payroll.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });

  // Organization ↔ Transaction
  Organization.hasMany(Transaction, {
    foreignKey: 'tenantId',
    as: 'transactions',
    onDelete: 'CASCADE',
  });
  Transaction.belongsTo(Organization, {
    foreignKey: 'tenantId',
    as: 'organization',
  });
}

export {
  Organization,
  User,
  Role,
  RefreshToken,
  Department,
  Customer,
  CustomerAddress,
  Product,
  Service,
  Quotation,
  QuotationSection,
  QuotationItem,
  Invoice,
  InvoiceItem,
  Payment,
  OfferLetter,
  Expense,
  Liability,
  Subscription,
  Payroll,
  Transaction,
};
