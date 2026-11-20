// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title UrbanIssueRegistry
/// @notice Registry of urban issues (broken streetlights, potholes, ...) reported by citizens
///         and handled by municipal staff. Lifecycle:
///         Reported -> Assigned -> InProgress -> Resolved -> Closed
contract UrbanIssueRegistry {
    // Types
    enum Status { Reported, Assigned, InProgress, Resolved, Closed }
    enum Priority { Low, Medium, High, Critical }

    struct Issue {
        string issueId;      // e.g. CITY-2026-001
        string issueType;    // e.g. StreetLight
        string location;     // e.g. Avenue Mohammed V
        string description;
        string reportDate;   // e.g. 2026-11-19 (kept as text to match the Excel file)
        Priority priority;
        string reportedBy;   // e.g. Citizen01 (label from the Excel file)
        address reporter;    // wallet that submitted the transaction
        string assignedTo;   // e.g. UrbanTeam01 ("" until assigned)
        Status status;
        uint256 createdAt;   // block timestamp
        uint256 updatedAt;   // block timestamp
    }

    struct HistoryEntry {
        Status status;
        string assignedTo;
        address changedBy;
        uint256 timestamp;
        string note;
    }

    // Storage
    address public owner;
    mapping(address => bool) public operators; // municipal staff allowed to assign / update

    mapping(string => Issue) private issues;
    mapping(string => HistoryEntry[]) private histories;
    string[] private issueIds;

    // Events
    event IssueCreated(string issueId, address indexed reporter, string issueType, Priority priority);
    event IssueAssigned(string issueId, string team, address indexed assignedBy);
    event IssueStatusUpdated(string issueId, Status oldStatus, Status newStatus, address indexed updatedBy);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyStaff() {
        require(msg.sender == owner || operators[msg.sender], "Only authorized staff");
        _;
    }

    modifier issueMustExist(string memory issueId) {
        require(_exists(issueId), "Issue does not exist");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Staff management
    function addOperator(address operator) external onlyOwner {
        require(operator != address(0), "Invalid address");
        operators[operator] = true;
        emit OperatorAdded(operator);
    }

    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
        emit OperatorRemoved(operator);
    }

    // Core features
    /// @notice Create a new issue (anyone can report). Initial status is Reported.
    function createIssue(
        string calldata issueId,
        string calldata issueType,
        string calldata location,
        string calldata description,
        string calldata reportDate,
        Priority priority,
        string calldata reportedBy
    ) external {
        require(bytes(issueId).length > 0, "issueId required");
        require(!_exists(issueId), "Issue already exists");
        require(bytes(issueType).length > 0, "issueType required");
        require(bytes(location).length > 0, "location required");
        require(bytes(description).length > 0, "description required");

        issues[issueId] = Issue({
            issueId: issueId,
            issueType: issueType,
            location: location,
            description: description,
            reportDate: reportDate,
            priority: priority,
            reportedBy: reportedBy,
            reporter: msg.sender,
            assignedTo: "",
            status: Status.Reported,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        issueIds.push(issueId);

        _record(issueId, Status.Reported, "", "Issue reported");
        emit IssueCreated(issueId, msg.sender, issueType, priority);
    }

    /// @notice Read one issue.
    function getIssue(string calldata issueId)
        external
        view
        issueMustExist(issueId)
        returns (Issue memory)
    {
        return issues[issueId];
    }

    /// @notice Assign (or re-assign) an intervention team. Moves Reported -> Assigned.
    function assignTeam(string calldata issueId, string calldata team)
        external
        onlyStaff
        issueMustExist(issueId)
    {
        require(bytes(team).length > 0, "team required");
        Issue storage issue = issues[issueId];
        require(
            issue.status == Status.Reported || issue.status == Status.Assigned,
            "Cannot assign at this stage"
        );

        Status oldStatus = issue.status;
        issue.assignedTo = team;
        issue.status = Status.Assigned;
        issue.updatedAt = block.timestamp;

        _record(issueId, Status.Assigned, team, "Team assigned");
        emit IssueAssigned(issueId, team, msg.sender);
        if (oldStatus != Status.Assigned) {
            emit IssueStatusUpdated(issueId, oldStatus, Status.Assigned, msg.sender);
        }
    }

    /// @notice Move an issue to the next status (InProgress -> Resolved -> Closed).
    function updateStatus(string calldata issueId, Status newStatus, string calldata note)
        external
        onlyStaff
        issueMustExist(issueId)
    {
        Issue storage issue = issues[issueId];
        Status oldStatus = issue.status;

        require(oldStatus != Status.Reported, "Assign a team first");
        require(uint8(newStatus) == uint8(oldStatus) + 1, "Invalid status transition");

        issue.status = newStatus;
        issue.updatedAt = block.timestamp;

        _record(issueId, newStatus, issue.assignedTo, note);
        emit IssueStatusUpdated(issueId, oldStatus, newStatus, msg.sender);
    }

    // History & listing
    function getHistory(string calldata issueId)
        external
        view
        issueMustExist(issueId)
        returns (HistoryEntry[] memory)
    {
        return histories[issueId];
    }

    function getIssueCount() external view returns (uint256) {
        return issueIds.length;
    }

    function getAllIssueIds() external view returns (string[] memory) {
        return issueIds;
    }

    function issueExists(string calldata issueId) external view returns (bool) {
        return _exists(issueId);
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------
    function _exists(string memory issueId) internal view returns (bool) {
        return issues[issueId].createdAt != 0;
    }

    function _record(
        string memory issueId,
        Status status,
        string memory assignedTo,
        string memory note
    ) internal {
        histories[issueId].push(
            HistoryEntry({
                status: status,
                assignedTo: assignedTo,
                changedBy: msg.sender,
                timestamp: block.timestamp,
                note: note
            })
        );
    }
}