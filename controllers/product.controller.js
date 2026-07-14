const { StatusCodes } = require('http-status-codes');
const { Product } = require('../models/index.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { NotFoundError } = require('../utils/app-error.js');

/**
 * GET /api/v1/products
 */
const listProducts = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const products = await Product.findAll({
    where: { tenantId },
    order: [['createdAt', 'DESC']],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: products,
  });
});

/**
 * GET /api/v1/products/:id
 */
const getProduct = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const product = await Product.findOne({ where: { id, tenantId } });
  if (!product) {
    throw new NotFoundError('Product');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: product,
  });
});

/**
 * POST /api/v1/products
 */
const createProduct = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { name, sku, hsn, category, price, gstRate, description } = req.body;

  const product = await Product.create({
    tenantId,
    name,
    sku: sku || null,
    hsn: hsn || null,
    category: category || null,
    price: Number(price) || 0,
    gstRate: Number(gstRate) || 0,
    description: description || null,
    createdBy: userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: product,
    message: 'Product created successfully',
  });
});

/**
 * PUT /api/v1/products/:id
 */
const updateProduct = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { id } = req.params;
  const { name, sku, hsn, category, price, gstRate, description } = req.body;

  const product = await Product.findOne({ where: { id, tenantId } });
  if (!product) {
    throw new NotFoundError('Product');
  }

  await product.update({
    name,
    sku: sku !== undefined ? sku : product.sku,
    hsn: hsn !== undefined ? hsn : product.hsn,
    category: category !== undefined ? category : product.category,
    price: price !== undefined ? Number(price) : product.price,
    gstRate: gstRate !== undefined ? Number(gstRate) : product.gstRate,
    description: description !== undefined ? description : product.description,
    updatedBy: userId,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: product,
    message: 'Product updated successfully',
  });
});

/**
 * DELETE /api/v1/products/:id
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const product = await Product.findOne({ where: { id, tenantId } });
  if (!product) {
    throw new NotFoundError('Product');
  }

  await product.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Product deleted successfully',
  });
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
};
