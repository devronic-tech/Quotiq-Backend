const fs = require('fs');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');

// Helper to get all JS files recursively
function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(getJsFiles(filePath));
      }
    } else if (file.endsWith('.js') && filePath !== __filename) {
      results.push(filePath);
    }
  });
  return results;
}

function convertFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // 1. Convert side-effect imports like import 'dotenv/config';
  content = content.replace(/import\s+['"]dotenv\/config['"]\s*;?/g, "require('dotenv').config();");

  // 2. Convert namespace imports: import * as X from 'Y';
  content = content.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g, "const $1 = require('$2');");

  // 3. Convert named imports: import { A, B } from 'Y'; (supporting multiline)
  content = content.replace(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]\s*;?/gs, (match, p1, p2) => {
    const cleanNames = p1.replace(/\s+/g, ' ').trim();
    return `const { ${cleanNames} } = require('${p2}');`;
  });

  // 4. Convert default imports: import X from 'Y';
  content = content.replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g, "const $1 = require('$2');");

  // 5. Convert dynamic imports to standard requires
  // Case: (await import('pdf-parse')).default
  content = content.replace(/\(await\s+import\(['"]([^'"]+)['"]\)\)\.default/g, "require('$1')");
  // Case: await import('pdf-parse')
  content = content.replace(/await\s+import\(['"]([^'"]+)['"]\)/g, "require('$1')");

  // 6. Convert export default
  let hasDefaultExport = false;
  let defaultExportName = '';
  content = content.replace(/export\s+default\s+(\w+)\s*;?/g, (match, name) => {
    hasDefaultExport = true;
    defaultExportName = name;
    return `module.exports = ${name};`;
  });

  // 7. Convert export blocks: export { A, B }
  content = content.replace(/export\s+{([^}]+)}\s*;?/gs, (match, p1) => {
    const cleanNames = p1.replace(/\s+/g, ' ').trim();
    return `module.exports = { ${cleanNames} };`;
  });

  // 8. Convert inline named exports: export const/let/class/function X
  const namedExports = [];
  
  // export const X = ...
  content = content.replace(/^export\s+const\s+(\w+)/gm, (match, name) => {
    namedExports.push(name);
    return `const ${name}`;
  });

  // export let X = ...
  content = content.replace(/^export\s+let\s+(\w+)/gm, (match, name) => {
    namedExports.push(name);
    return `let ${name}`;
  });

  // export class X ...
  content = content.replace(/^export\s+class\s+(\w+)/gm, (match, name) => {
    namedExports.push(name);
    return `class ${name}`;
  });

  // export async function X ...
  content = content.replace(/^export\s+async\s+function\s+(\w+)/gm, (match, name) => {
    namedExports.push(name);
    return `async function ${name}`;
  });

  // export function X ...
  content = content.replace(/^export\s+function\s+(\w+)/gm, (match, name) => {
    namedExports.push(name);
    return `function ${name}`;
  });

  // Append named exports if any are found and there's no default export already handled in CJS style
  if (namedExports.length > 0) {
    if (hasDefaultExport) {
      // If we had export default X, we append the named exports to module.exports
      let append = `\n`;
      namedExports.forEach(name => {
        append += `module.exports.${name} = ${name};\n`;
      });
      content += append;
    } else {
      // Otherwise export them as an object
      const exportList = namedExports.join(', ');
      content += `\nmodule.exports = {\n  ${namedExports.join(',\n  ')}\n};\n`;
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Converted: ${path.relative(backendDir, filePath)}`);
  }
}

console.log('Starting conversion of ESM to CommonJS...');
const files = getJsFiles(backendDir);
files.forEach(file => {
  try {
    convertFile(file);
  } catch (err) {
    console.error(`Error converting ${file}:`, err);
  }
});
console.log('Conversion complete!');
