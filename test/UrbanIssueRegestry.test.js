const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const Status = { Reported: 0, Assigned: 1, InProgress: 2, Resolved: 3, Closed: 4 };
const Priority = { Low: 0, Medium: 1, High: 2, Critical: 3 };

const SAMPLE = [
  "CITY-2026-001",
  "StreetLight",
  "Avenue Mohammed V",
  "Streetlight not working",
  "2026-11-19",
  Priority.High,
  "Citizen01",
];
const ID = SAMPLE[0];

async function deployFixture() {
  const [owner, operator, citizen, stranger] = await ethers.getSigners();
  const registry = await ethers.deployContract("UrbanIssueRegistry");
  await registry.waitForDeployment();
  return { registry, owner, operator, citizen, stranger };
}

async function withIssueFixture() {
  const base = await deployFixture();
  await base.registry.connect(base.citizen).createIssue(SAMPLE);
  return base;
}

describe("UrbanIssueRegistry", function () {
  describe("Deployment & staff", function () {
    it("sets the deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("lets the owner add and remove operators", async function () {
      const { registry, owner, operator } = await loadFixture(deployFixture);
      await expect(registry.connect(owner).addOperator(operator.address))
        .to.emit(registry, "OperatorAdded")
        .withArgs(operator.address);
      expect(await registry.operators(operator.address)).to.equal(true);

      await expect(registry.connect(owner).removeOperator(operator.address))
        .to.emit(registry, "OperatorRemoved")
        .withArgs(operator.address);
      expect(await registry.operators(operator.address)).to.equal(false);
    });

    it("rejects operator management from non-owners", async function () {
      const { registry, stranger, operator } = await loadFixture(deployFixture);
      await expect(
        registry.connect(stranger).addOperator(operator.address)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Creating & reading issues", function () {
    it("creates an issue with status Reported and emits IssueCreated", async function () {
      const { registry, citizen } = await loadFixture(deployFixture);
      await expect(registry.connect(citizen).createIssue(SAMPLE))
        .to.emit(registry, "IssueCreated")
        .withArgs(ID, citizen.address, "StreetLight", Priority.High);

      const issue = await registry.getIssue(ID);
      expect(issue.issueId).to.equal(ID);
      expect(issue.location).to.equal("Avenue Mohammed V");
      expect(issue.reporter).to.equal(citizen.address);
      expect(issue.assignedTo).to.equal("");
      expect(issue.status).to.equal(Status.Reported);
      expect(await registry.getIssueCount()).to.equal(1);
    });

    it("rejects duplicate ids", async function () {
      const { registry, citizen } = await loadFixture(withIssueFixture);
      await expect(
        registry.connect(citizen).createIssue(SAMPLE)
      ).to.be.revertedWith("Issue already exists");
    });

    it("rejects empty required fields", async function () {
      const { registry, citizen } = await loadFixture(deployFixture);
      const bad = [...SAMPLE];
      bad[0] = "";
      await expect(
        registry.connect(citizen).createIssue(bad)
      ).to.be.revertedWith("issueId required");

      const bad2 = [...SAMPLE];
      bad2[3] = "";
      await expect(
        registry.connect(citizen).createIssue(bad2)
      ).to.be.revertedWith("description required");
    });

    it("reverts when reading an unknown issue", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.getIssue("NOPE")).to.be.revertedWith("Issue does not exist");
    });

    it("lists all issue ids", async function () {
      const { registry, citizen } = await loadFixture(withIssueFixture);
      const second = [...SAMPLE];
      second[0] = "CITY-2026-002";
      await registry.connect(citizen).createIssue(second);
      expect(await registry.getAllIssueIds()).to.deep.equal([ID, "CITY-2026-002"]);
    });
  });

  describe("Assignment", function () {
    it("lets the owner assign a team (Reported -> Assigned)", async function () {
      const { registry, owner } = await loadFixture(withIssueFixture);
      const tx = registry.connect(owner).assignTeam(ID, "UrbanTeam01");
      await expect(tx).to.emit(registry, "IssueAssigned").withArgs(ID, "UrbanTeam01", owner.address);
      await expect(tx)
        .to.emit(registry, "IssueStatusUpdated")
        .withArgs(ID, Status.Reported, Status.Assigned, owner.address);

      const issue = await registry.getIssue(ID);
      expect(issue.assignedTo).to.equal("UrbanTeam01");
      expect(issue.status).to.equal(Status.Assigned);
    });

    it("lets an operator assign, but not a stranger", async function () {
      const { registry, owner, operator, stranger } = await loadFixture(withIssueFixture);
      await registry.connect(owner).addOperator(operator.address);
      await registry.connect(operator).assignTeam(ID, "UrbanTeam02");

      await expect(
        registry.connect(stranger).assignTeam(ID, "UrbanTeam03")
      ).to.be.revertedWith("Only authorized staff");
    });

    it("allows re-assignment while Assigned, but not later", async function () {
      const { registry, owner } = await loadFixture(withIssueFixture);
      await registry.assignTeam(ID, "UrbanTeam01");
      await registry.assignTeam(ID, "UrbanTeam02"); // re-assign OK
      expect((await registry.getIssue(ID)).assignedTo).to.equal("UrbanTeam02");

      await registry.updateStatus(ID, Status.InProgress, "Work started");
      await expect(
        registry.connect(owner).assignTeam(ID, "UrbanTeam03")
      ).to.be.revertedWith("Cannot assign at this stage");
    });

    it("rejects an empty team name", async function () {
      const { registry } = await loadFixture(withIssueFixture);
      await expect(registry.assignTeam(ID, "")).to.be.revertedWith("team required");
    });
  });

  describe("Status lifecycle", function () {
    it("walks the full lifecycle and records the history", async function () {
      const { registry, owner } = await loadFixture(withIssueFixture);
      await registry.connect(owner).assignTeam(ID, "UrbanTeam01");

      await expect(registry.updateStatus(ID, Status.InProgress, "Team on site"))
        .to.emit(registry, "IssueStatusUpdated")
        .withArgs(ID, Status.Assigned, Status.InProgress, owner.address);
      await registry.updateStatus(ID, Status.Resolved, "Lamp replaced");
      await registry.updateStatus(ID, Status.Closed, "Verified");

      expect((await registry.getIssue(ID)).status).to.equal(Status.Closed);

      const history = await registry.getHistory(ID);
      expect(history.length).to.equal(5); // Reported, Assigned, InProgress, Resolved, Closed
      expect(history[0].status).to.equal(Status.Reported);
      expect(history[4].status).to.equal(Status.Closed);
      expect(history[2].note).to.equal("Team on site");
      expect(history[2].assignedTo).to.equal("UrbanTeam01");
    });

    it("refuses to update a Reported issue without a team", async function () {
      const { registry } = await loadFixture(withIssueFixture);
      await expect(
        registry.updateStatus(ID, Status.InProgress, "")
      ).to.be.revertedWith("Assign a team first");
    });

    it("refuses to skip or go backwards", async function () {
      const { registry } = await loadFixture(withIssueFixture);
      await registry.assignTeam(ID, "UrbanTeam01");
      await expect(
        registry.updateStatus(ID, Status.Resolved, "skip")
      ).to.be.revertedWith("Invalid status transition");
      await expect(
        registry.updateStatus(ID, Status.Reported, "back")
      ).to.be.revertedWith("Invalid status transition");
    });

    it("refuses status updates from non-staff", async function () {
      const { registry, stranger } = await loadFixture(withIssueFixture);
      await registry.assignTeam(ID, "UrbanTeam01");
      await expect(
        registry.connect(stranger).updateStatus(ID, Status.InProgress, "hack")
      ).to.be.revertedWith("Only authorized staff");
    });

    it("refuses any update after Closed", async function () {
      const { registry } = await loadFixture(withIssueFixture);
      await registry.assignTeam(ID, "UrbanTeam01");
      await registry.updateStatus(ID, Status.InProgress, "");
      await registry.updateStatus(ID, Status.Resolved, "");
      await registry.updateStatus(ID, Status.Closed, "");
      await expect(
        registry.updateStatus(ID, Status.Closed, "again")
      ).to.be.revertedWith("Invalid status transition");
    });
  });
});