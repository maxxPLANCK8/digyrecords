/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function visiblePickupsFor(userId) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);
    const result = await client.query(`
      select tracking_number, recipient_name, org_id
      from public.pickups
      order by tracking_number
    `);
    await client.query("rollback");
    return result.rows;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  await client.connect();

  const patriciaRows = await visiblePickupsFor(
    "a2bddb4f-f406-4b56-acf4-343123c5a8cf",
  );
  console.log("Patricia visible pickups:");
  console.table(patriciaRows);

  const samuelRows = await visiblePickupsFor(
    "ab82378d-044d-4e9c-baeb-f2b495249bc6",
  );
  console.log("Samuel visible pickups:");
  console.table(samuelRows);

  const patriciaTrackingNumbers = patriciaRows.map((row) => row.tracking_number);
  if (
    patriciaTrackingNumbers.length !== 1 ||
    patriciaTrackingNumbers[0] !== "KM-WST-0001"
  ) {
    throw new Error(
      `Patricia RLS failed: saw ${patriciaTrackingNumbers.join(", ")}`,
    );
  }

  const samuelTrackingNumbers = samuelRows.map((row) => row.tracking_number);
  if (
    samuelTrackingNumbers.length !== 1 ||
    samuelTrackingNumbers[0] !== "KM-RNG-0001"
  ) {
    throw new Error(`Samuel RLS failed: saw ${samuelTrackingNumbers.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
