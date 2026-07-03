/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");

const path = process.argv[2] || ".env.vercel.preview";
const buffer = fs.readFileSync(path);

console.log("file first bytes", [...buffer.subarray(0, 12)]);

for (const line of buffer.toString("utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) {
    continue;
  }

  const separatorIndex = line.indexOf("=");
  if (separatorIndex === -1) {
    continue;
  }

  const name = line.slice(0, separatorIndex);
  let value = line.slice(separatorIndex + 1);
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  const bytes = Buffer.from(value, "utf8");
  console.log(name, {
    length: value.length,
    firstChars: [
      value.charCodeAt(0),
      value.charCodeAt(1),
      value.charCodeAt(2),
    ],
    firstBytes: [...bytes.subarray(0, 8)],
    startsBOM: bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191,
  });
}
