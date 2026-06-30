import { ValidationError } from '../utils/app-error.js';

export function validate(schemas) {
  return (req, _res, next) => {
    const errors = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path = issue.path.join('.');
          const key = path || '_root';
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        }
      } else {
        req.body = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path = `query.${issue.path.join('.')}`;
          if (!errors[path]) errors[path] = [];
          errors[path].push(issue.message);
        }
      } else {
        req.query = result.data;
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path = `params.${issue.path.join('.')}`;
          if (!errors[path]) errors[path] = [];
          errors[path].push(issue.message);
        }
      } else {
        req.params = result.data;
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    next();
  };
}
