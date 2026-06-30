import { StatusCodes } from 'http-status-codes';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ValidationError } from '../utils/app-error.js';

/**
 * Transcribes audio buffer using Deepgram API
 */
async function transcribeAudio(audioBuffer, mimeType) {
  if (!env.DEEPGRAM_API_KEY) {
    throw new Error('Deepgram API key is not configured');
  }

  const response = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&model=nova-2', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${env.DEEPGRAM_API_KEY}`,
      'Content-Type': mimeType || 'audio/wav',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error({ status: response.status, error: errText }, 'Deepgram transcription failed');
    throw new Error(`Deepgram API returned status ${response.status}`);
  }

  const result = await response.json();
  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (!transcript) {
    throw new Error('Failed to extract transcript from Deepgram response');
  }

  return transcript;
}

/**
 * Parses PDF buffer into raw text
 */
async function parsePDF(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    logger.error({ err }, 'Failed parsing PDF');
    throw new Error(`PDF parsing failed: ${err.message}`);
  }
}

/**
 * Parses DOCX buffer into raw text
 */
async function parseDocx(buffer) {
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    logger.error({ err }, 'Failed parsing DOCX');
    throw new Error(`DOCX parsing failed: ${err.message}`);
  }
}

/**
 * Parses transcription or description into structured quotation JSON using Groq API
 */
async function parseQuotation(text) {
  if (!env.GROQ_API_KEY) {
    throw new Error('Groq API key is not configured');
  }

  const systemPrompt = `You are a professional proposal and quotation generator assistant.
Analyze the user's description (which may be a transcribed voice request) and extract a highly structured quotation in JSON format.
Ensure you align the fields to match the styling and template details of a professional business proposal.

Your response MUST be a valid JSON object matching this schema exactly:
{
  "customerName": "Client or Customer company name (e.g. Acme Corp)",
  "contactPerson": "Contact person name (e.g. Sufiyan, Mr. Sufiyan, Sarah)",
  "billingAddress": "Billing address or location details",
  "departmentName": "Department name (e.g. Engineering, Sales)",
  "projectName": "A concise, professional project title",
  "projectType": "The type of project (e.g. Website Development, Mobile App, Design)",
  "description": "An executive summary or overview description of the project scope",
  "currency": "Three-letter currency code (e.g. USD, INR, EUR)",
  "estimatedStart": "Estimated project start date in YYYY-MM-DD format",
  "duration": "Duration description (e.g. '12 Weeks', '3 Months')",
  "paymentTerms": "Three percentages separated by commas summing to 100 (e.g. '30,40,30' representing 30% upfront, 40% mid-project, 30% final delivery)",
  "termsAndConditions": "Validity, technical support terms, and other conditions",
  "sections": [
    {
      "name": "Section Name (e.g. SOW Module or Core Deliverables)",
      "scopeDescription": "Detailed bullet points describing features/scope for this module, one per line (e.g., '• Sign Up - secure email registration\\n• Login - JWT token auth\\n• Password Reset')",
      "items": [
        {
          "description": "Specific feature or deliverable name and details, separated by ' - ' (e.g., 'System Architecture Design - End-to-end technical blueprinting')",
          "quantity": 1,
          "unit": "units",
          "unitPrice": 1500,
          "tax": 0
        }
      ]
    }
  ]
}

Ensure all prices, quantities, taxes, and values are numbers (not strings). If pricing or values are not specified, estimate reasonable market values (e.g. $1000-$5000 range).
If any customer details (customerName, contactPerson, billingAddress, departmentName) or timeline details (estimatedStart, duration, paymentTerms) are not explicitly mentioned in the description, intelligently infer them based on the context, or leave them as empty strings/default percentages. Do not make up random fake customer names unless hinted in the description.
Do not output any markdown formatting, preambles, or explanations outside the JSON object. Output ONLY the raw JSON object.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error({ status: response.status, error: errText }, 'Groq parser failed');
    throw new Error(`Groq API returned status ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned empty response content');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    logger.error({ content, error }, 'Failed to parse JSON from Groq response');
    throw new Error('Invalid JSON structure returned by AI model');
  }
}

/**
 * POST /api/v1/ai/generate-quotation
 * Accepts either:
 * - An audio or document file (via multer)
 * - A text description (via req.body.description)
 */
export const generateQuotation = asyncHandler(async (req, res) => {
  let textContent = req.body?.description;
  const file = req.file || req.files?.[0];

  // If a file is uploaded, parse it depending on its type
  if (file) {
    logger.info({ originalname: file.originalname, size: file.size, mimeType: file.mimetype }, 'Processing uploaded file');
    
    const isPDF = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                   file.mimetype === 'application/msword' ||
                   file.originalname.toLowerCase().endsWith('.docx') ||
                   file.originalname.toLowerCase().endsWith('.doc');

    try {
      if (isPDF) {
        textContent = await parsePDF(file.buffer);
        logger.info('PDF parsed successfully');
      } else if (isDocx) {
        textContent = await parseDocx(file.buffer);
        logger.info('DOCX parsed successfully');
      } else {
        // Fallback to audio transcription
        textContent = await transcribeAudio(file.buffer, file.mimetype);
        logger.info({ textContent }, 'Speech-to-text transcription completed');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse uploaded file');
      throw new ValidationError(`File parsing failed: ${err.message}`);
    }
  }

  if (!textContent || textContent.trim() === '') {
    throw new ValidationError('A voice recording, document upload, or text description is required');
  }

  logger.info({ textLength: textContent.length }, 'Parsing text content into quotation via Groq');
  try {
    const parsedData = await parseQuotation(textContent);
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        transcript: textContent,
        quotation: parsedData,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to parse quotation text');
    throw new ValidationError(`Quotation generation failed: ${err.message}`);
  }
});
