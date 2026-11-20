const hre = require("hardhat");
const { address } = require("../frontend/src/contracts/UrbanIssueRegistry.json");

async function main() {
  const registry = await hre.ethers.getContractAt("UrbanIssueRegistry", address);

  const rows = [
    ["CITY-2026-001", "StreetLight", "Avenue Mohammed V", "Streetlight not working", "2026-11-19", 2, "Citizen01"],
    ["CITY-2026-002", "Pothole", "Boulevard Pasteur", "Large pothole near crossing", "2026-11-19", 3, "Citizen02"],
    ["CITY-2026-003", "Garbage", "Rue de Fes", "Overflowing public bin", "2026-11-20", 1, "Citizen03"],
  ];

  for (const r of rows) {
    const tx = await registry.createIssue(r);
    await tx.wait();
    console.log("Created", r[0]);
  }

  await (await registry.assignTeam("CITY-2026-001", "UrbanTeam01")).wait();
  await (await registry.updateStatus("CITY-2026-001", 2, "Team on site")).wait();
  console.log("CITY-2026-001 is now InProgress");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});