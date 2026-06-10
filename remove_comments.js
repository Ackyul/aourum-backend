const fs = require('fs');
const path = require('path');

const files = [
  'c:/Users/USER/dev/AOURUM/frontend/src/app/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/layout.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/globals.css',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/bands/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/bands/[slug]/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/brands/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/brands/[slug]/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/dashboard/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/fairs/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/fairs/[slug]/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/people/[username]/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/products/[id]/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/app/products/[slug]/page.js',
  'c:/Users/USER/dev/AOURUM/frontend/src/context/AppContext.js',
  'c:/Users/USER/dev/AOURUM/backend/server.js',
  'c:/Users/USER/dev/AOURUM/backend/db.js',
];

function removeComments(content, filePath) {
  const isCss = filePath.endsWith('.css');
  
  if (isCss) {
    // Remove CSS block comments /* ... */
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // Clean up multiple blank lines
    content = content.replace(/\n{3,}/g, '\n\n');
    return content.trim() + '\n';
  }

  // For JS/JSX files:
  // 1. Remove JSX comments {/* ... */}
  content = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  
  // 2. Remove single-line comments // ... (but not URLs like https://)
  //    We process line by line to be safe
  const lines = content.split('\n');
  const result = [];
  let inMultilineString = false;
  let inTemplateLiteral = 0;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Remove standalone // comment lines (whole line is a comment)
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      // Skip this line entirely
      continue;
    }
    
    // Remove inline // comments (but not inside strings or URLs)
    // Simple heuristic: find // that isn't preceded by : (URL) or inside a string
    line = line.replace(/(\s*)\/\/(?!.*https?:\/\/)(?:[^'"`]|'[^']*'|"[^"]*"|`[^`]*`)*$/, (match, leading) => {
      // Only remove if the leading content before // is safe
      return '';
    });
    
    result.push(line);
  }
  
  let processed = result.join('\n');
  
  // 3. Remove block comments /* ... */ that aren't JSDoc /** or license
  processed = processed.replace(/\/\*(?!\*[\s\S])[\s\S]*?\*\//g, '');
  
  // 4. Remove ── section divider comments like // ─── Section ─────
  processed = processed.replace(/\/\/\s*[─-]{3,}.*\n?/g, '');
  
  // 5. Clean up multiple blank lines (more than 2 consecutive)
  processed = processed.replace(/\n{4,}/g, '\n\n');
  
  return processed;
}

let totalProcessed = 0;
for (const filePath of files) {
  const normalPath = filePath.replace(/\//g, path.sep);
  if (!fs.existsSync(normalPath)) {
    console.log(`⚠️  Skipping (not found): ${filePath}`);
    continue;
  }
  
  try {
    const original = fs.readFileSync(normalPath, 'utf8');
    const cleaned = removeComments(original, filePath);
    
    if (cleaned !== original) {
      fs.writeFileSync(normalPath, cleaned, 'utf8');
      console.log(`✅ Cleaned: ${path.basename(filePath)}`);
      totalProcessed++;
    } else {
      console.log(`✓  No changes: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.log(`✗  Error on ${path.basename(filePath)}: ${err.message}`);
  }
}

console.log(`\nDone. ${totalProcessed} files modified.`);
