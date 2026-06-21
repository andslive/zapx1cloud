const text = await Deno.readTextFile(Deno.args[0]);
let balance = 0;
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '(') balance++;
    if (char === ')') balance--;
    if (balance < 0) {
      console.log(`Line ${i + 1}, Col ${j + 1}: Parenthesis balance went negative (${balance})`);
      console.log(`Context: ${line.substring(Math.max(0, j-20), j+1)}`);
      balance = 0; // Reset to find next
    }
  }
}
console.log(`Final balance: ${balance}`);
