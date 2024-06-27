// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract GPUToken is ERC20 {

  address public owner;

  constructor() ERC20('Node AI', 'GPU') {
    _mint(msg.sender, 100_000_000 ether);
    owner = msg.sender;
  }

  receive() external payable {
    payable(owner).transfer(msg.value);
  }
}
