import fs from 'fs';
const css = fs.readFileSync('src/style.css', 'utf8');
const lines = css.split('\n');
console.log("Checking for unclosed braces...");
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
  if (depth < 0) {
    console.error(`Negative depth at line ${i+1}: ${line}`);
    process.exit(1);
  }
}
if (depth !== 0) {
  console.error(`Unclosed brace, final depth: ${depth}`);
} else {
  console.log("Braces are balanced.");
}
