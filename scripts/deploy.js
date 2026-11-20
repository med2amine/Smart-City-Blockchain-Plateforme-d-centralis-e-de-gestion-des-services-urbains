const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Network  :", hre.network.name);
  console.log("Deployer :", deployer.address);

  const registry = await hre.ethers.deployContract("UrbanIssueRegistry");
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log("UrbanIssueRegistry deployed to:", address);

  const artifact = await hre.artifacts.readArtifact("UrbanIssueRegistry");
  const { chainId } = await hre.ethers.provider.getNetwork();
  const outDir = path.join(__dirname, "..", "frontend", "src", "contracts");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "UrbanIssueRegistry.json"),
    JSON.stringify(
      { address, network: hre.network.name, chainId: Number(chainId), abi: artifact.abi },
      null,
      2
    )
  );
  console.log("ABI + address written to frontend/src/contracts/UrbanIssueRegistry.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
