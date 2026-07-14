const { OfferLetter } = require('../models/index.js');
const { StatusCodes } = require('http-status-codes');
const { asyncHandler } = require('../utils/async-handler.js');
const { NotFoundError } = require('../utils/app-error.js');
const { createOfferSchema, updateOfferSchema } = require('../schemas/offer-letter.schema.js');
const { sequelize } = require('../config/database.js');

/**
 * GET /api/v1/offers
 */
const listOffers = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const offers = await OfferLetter.findAll({
    where: { tenantId },
    order: [['createdAt', 'DESC']],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: offers,
  });
});

/**
 * GET /api/v1/offers/:id
 */
const getOffer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const offer = await OfferLetter.findOne({
    where: { id, tenantId },
  });

  if (!offer) {
    throw new NotFoundError('Offer Letter');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: offer,
  });
});

/**
 * POST /api/v1/offers
 */
const createOffer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  
  // Validate request body
  const validation = createOfferSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      },
    });
  }

  const input = validation.data;

  const result = await sequelize.transaction(async (t) => {
    const count = await OfferLetter.count({ where: { tenantId }, transaction: t });
    const offerNumber = `OFF-${String(count + 1).padStart(4, '0')}`;

    const offer = await OfferLetter.create(
      {
        tenantId,
        offerNumber,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail,
        candidatePhone: input.candidatePhone || null,
        candidateAddress: input.candidateAddress,
        jobTitle: input.jobTitle,
        department: input.department,
        jobType: input.jobType,
        workplaceType: input.workplaceType,
        salaryPerMonth: input.salaryPerMonth,
        joiningDate: new Date(input.joiningDate),
        status: input.status || 'draft',
        notes: input.notes || null,
        letterContent: input.letterContent,
      },
      { transaction: t }
    );

    return offer;
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: result,
    message: 'Offer letter created successfully',
  });
});

/**
 * PUT /api/v1/offers/:id
 */
const updateOffer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  // Validate request body
  const validation = updateOfferSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      },
    });
  }

  const input = validation.data;

  const offer = await OfferLetter.findOne({ where: { id, tenantId } });
  if (!offer) {
    throw new NotFoundError('Offer Letter');
  }

  await offer.update({
    candidateName: input.candidateName !== undefined ? input.candidateName : offer.candidateName,
    candidateEmail: input.candidateEmail !== undefined ? input.candidateEmail : offer.candidateEmail,
    candidatePhone: input.candidatePhone !== undefined ? input.candidatePhone : offer.candidatePhone,
    candidateAddress: input.candidateAddress !== undefined ? input.candidateAddress : offer.candidateAddress,
    jobTitle: input.jobTitle !== undefined ? input.jobTitle : offer.jobTitle,
    department: input.department !== undefined ? input.department : offer.department,
    jobType: input.jobType !== undefined ? input.jobType : offer.jobType,
    workplaceType: input.workplaceType !== undefined ? input.workplaceType : offer.workplaceType,
    salaryPerMonth: input.salaryPerMonth !== undefined ? input.salaryPerMonth : offer.salaryPerMonth,
    joiningDate: input.joiningDate !== undefined ? new Date(input.joiningDate) : offer.joiningDate,
    status: input.status !== undefined ? input.status : offer.status,
    notes: input.notes !== undefined ? input.notes : offer.notes,
    letterContent: input.letterContent !== undefined ? input.letterContent : offer.letterContent,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: offer,
    message: 'Offer letter updated successfully',
  });
});

/**
 * DELETE /api/v1/offers/:id
 */
const deleteOffer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const offer = await OfferLetter.findOne({ where: { id, tenantId } });
  if (!offer) {
    throw new NotFoundError('Offer Letter');
  }

  await offer.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Offer letter deleted successfully',
  });
});

module.exports = {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer
};
