#!/bin/bash

## Customize these environment variables for your own full node.
export RPC_URI=172.17.0.1:8332
export RPC_USER=bitcoin
export RPC_PASS=password

# Normal indexing, scanning every block and starting at SLP genesis.
npm start

# Fast reindex using a tx-map of SLP transactions.
#npm run reindex
