const { z } = require('zod');

const departmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters').max(100).trim(),
});

module.exports = {
  departmentSchema
};
