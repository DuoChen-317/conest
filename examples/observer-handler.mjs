// A quiet JSON-contract example. Replace with your own trusted agent integration.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { event } = JSON.parse(input);
console.error(`Observed event ${event.id}; no autonomous actions configured.`);
process.stdout.write("[]");
