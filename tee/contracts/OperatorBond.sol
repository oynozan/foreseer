// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title OperatorBond
/// @notice Phase 6 operator bonding: operators stake native FLR as a good
/// behavior bond. Governance can slash a misbehaving operator to the
/// treasury. Withdrawals go through a request/delay window so a pending
/// slash cannot be front-run by an instant exit.
contract OperatorBond {
    address public governance;
    address public treasury;
    uint256 public minimumBond;
    uint256 public withdrawDelay;

    struct Bond {
        uint256 amount;
        uint256 pendingWithdraw;
        uint256 withdrawableAt;
    }
    mapping(address operator => Bond) public bonds;

    event Bonded(address indexed operator, uint256 amount, uint256 total);
    event WithdrawRequested(address indexed operator, uint256 amount, uint256 withdrawableAt);
    event Withdrawn(address indexed operator, uint256 amount);
    event Slashed(address indexed operator, uint256 amount, string reason);

    modifier onlyGovernance() {
        require(msg.sender == governance, "only governance");
        _;
    }

    constructor(address _governance, address _treasury, uint256 _minimumBond, uint256 _withdrawDelay) {
        require(_governance != address(0), "governance cannot be zero address");
        require(_treasury != address(0), "treasury cannot be zero address");
        governance = _governance;
        treasury = _treasury;
        minimumBond = _minimumBond;
        withdrawDelay = _withdrawDelay;
    }

    /// @notice Stake native value as bond. Total must reach minimumBond.
    function bond() external payable {
        Bond storage b = bonds[msg.sender];
        b.amount += msg.value;
        require(b.amount >= minimumBond, "bond below minimum");
        emit Bonded(msg.sender, msg.value, b.amount);
    }

    /// @notice True while the operator holds at least the minimum bond.
    function isBonded(address _operator) external view returns (bool) {
        return bonds[_operator].amount >= minimumBond;
    }

    /// @notice Starts the withdrawal clock for part of the bond.
    function requestWithdraw(uint256 _amount) external {
        Bond storage b = bonds[msg.sender];
        require(_amount > 0 && _amount <= b.amount, "amount exceeds bond");
        require(b.pendingWithdraw == 0, "withdrawal already pending");
        b.amount -= _amount;
        b.pendingWithdraw = _amount;
        b.withdrawableAt = block.timestamp + withdrawDelay;
        emit WithdrawRequested(msg.sender, _amount, b.withdrawableAt);
    }

    /// @notice Completes a matured withdrawal request.
    function withdraw() external {
        Bond storage b = bonds[msg.sender];
        uint256 amount = b.pendingWithdraw;
        require(amount > 0, "nothing pending");
        require(block.timestamp >= b.withdrawableAt, "withdrawal still locked");
        b.pendingWithdraw = 0;
        b.withdrawableAt = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Slashes active or pending bond to the treasury.
    function slash(address _operator, uint256 _amount, string calldata _reason) external onlyGovernance {
        Bond storage b = bonds[_operator];
        uint256 available = b.amount + b.pendingWithdraw;
        require(_amount > 0 && _amount <= available, "amount exceeds bond");
        uint256 fromPending = _amount <= b.pendingWithdraw ? _amount : b.pendingWithdraw;
        b.pendingWithdraw -= fromPending;
        b.amount -= _amount - fromPending;
        (bool ok, ) = treasury.call{value: _amount}("");
        require(ok, "transfer failed");
        emit Slashed(_operator, _amount, _reason);
    }

    function setGovernance(address _governance) external onlyGovernance {
        require(_governance != address(0), "governance cannot be zero address");
        governance = _governance;
    }

    function setParameters(uint256 _minimumBond, uint256 _withdrawDelay) external onlyGovernance {
        minimumBond = _minimumBond;
        withdrawDelay = _withdrawDelay;
    }
}
