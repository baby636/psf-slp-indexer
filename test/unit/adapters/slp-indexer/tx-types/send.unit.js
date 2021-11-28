/*
  Unit tests for GENESIS tx indexing library genesis.js
*/

// Public npm libraries
const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')
const BigNumber = require('bignumber.js')

// Local libraries
const Send = require('../../../../../src/adapters/slp-indexer/tx-types/send')
const Cache = require('../../../../../src/adapters/slp-indexer/lib/cache')
const MockLevel = require('../../../../unit/mocks/leveldb-mock')
const mockDataLib = require('../../../../unit/mocks/send-mock')

describe('#send.js', () => {
  let uut, sandbox, mockData

  beforeEach(() => {
    const addrDb = new MockLevel()
    const tokenDb = new MockLevel()
    const txDb = new MockLevel()
    txDb.get = () => {
      throw new Error('not in db')
    }

    const cache = new Cache({ txDb })

    uut = new Send({ cache, addrDb, tokenDb, txDb })

    mockData = cloneDeep(mockDataLib)

    sandbox = sinon.createSandbox()
  })

  afterEach(() => sandbox.restore())

  describe('#constructor', () => {
    it('should throw error if cache is not passed in', () => {
      try {
        uut = new Send()

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'Must pass cache instance when instantiating send.js')
      }
    })

    it('should throw error if address DB is not passed in', () => {
      try {
        const txDb = new MockLevel()
        const cache = new Cache({ txDb })

        uut = new Send({ cache })

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'Must pass address DB instance when instantiating send.js')
      }
    })

    it('should throw error if token DB is not passed in', () => {
      try {
        const txDb = new MockLevel()
        const cache = new Cache({ txDb })
        const addrDb = new MockLevel()

        uut = new Send({ cache, addrDb })

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'Must pass token DB instance when instantiating send.js')
      }
    })

    it('should throw error if transaction DB is not passed in', () => {
      try {
        const txDb = new MockLevel()
        const cache = new Cache({ txDb })
        const addrDb = new MockLevel()
        const tokenDb = new MockLevel()

        uut = new Send({ cache, addrDb, tokenDb })

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.equal(err.message, 'Must pass transaction DB instance when instantiating send.js')
      }
    })
  })

  describe('#subtractBalanceFromSend', () => {
    it('should subtract a balance from an address object', () => {
      const result = uut.subtractBalanceFromSend(mockData.addrData01, mockData.utxo01)
      // console.log('result: ', result)

      assert.equal(result, true)
    })

    it('should catch and throw errors', async () => {
      try {
        await uut.subtractBalanceFromSend()

        assert.fail('Unexpected code path')
      } catch (err) {
        // console.log('err: ', err)
        assert.include(err.message, 'Cannot read property')
      }
    })
  })

  describe('#subtractTokensFromInputAddr', () => {
    it('should subtract tokens from the input address', async () => {
      // Force DAG validation to succeed
      sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: true })

      // Force database to return previous address data
      sandbox.stub(uut.addrDb, 'get').resolves(mockData.addrData01)

      const result = await uut.subtractTokensFromInputAddr(mockData.sendData01)
      // console.log('result: ', result)

      assert.equal(result, true)
    })

    it('should skip inputs without a matching token ID', async () => {
      // Force input token ID to be different
      mockData.sendData01.txData.vin[1].tokenId = 'fake-token-id'

      const result = await uut.subtractTokensFromInputAddr(mockData.sendData01)
      // console.log('result: ', result)

      assert.equal(result, true)
    })

    it('should mark token qty as 0 if input fails DAG validation', async () => {
      // Force DAG validation to fail
      sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: false })

      const result = await uut.subtractTokensFromInputAddr(mockData.sendData01)
      console.log('result: ', result)
    })

    it('should throw an error if there are no UTXOs to delete', async () => {
      try {
      // Force DAG validation to succeed
        sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: true })

        // Force UTXO to fail filter
        mockData.addrData01.utxos[0].txid = 'bad-txid'

        // Force database to return previous address data
        sandbox.stub(uut.addrDb, 'get').resolves(mockData.addrData01)

        await uut.subtractTokensFromInputAddr(mockData.sendData01)

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.include(err.message, 'Input UTXO with TXID')
      }
    })

    it('should throw an error if utxo can not be found in database', async () => {
      try {
      // Force DAG validation to succeed
        sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: true })

        // Force UTXO to fail filter
        const badAddrData = cloneDeep(mockData.addrData01)
        badAddrData.utxos[0].txid = 'bad-txid'

        // Mock response from addr database
        sandbox.stub(uut.addrDb, 'get')
          .onCall(0).resolves(mockData.addrData01)
          .onCall(1).resolves(badAddrData)

        await uut.subtractTokensFromInputAddr(mockData.sendData01)

        assert.fail('Unexpected code path')
      } catch (err) {
        assert.include(err.message, 'Could not find UTXO in address')
      }
    })

    // This test comes from real-world data and a bug where it was noticed that
    // send after genesis was not properly deleting the original UTXO.
    it('should subtract tokens using real-world data', async () => {
      // Force DAG validation to succeed
      sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: true })

      // Force database to return previous address data
      sandbox.stub(uut.addrDb, 'get').resolves(mockData.addrData02)

      const result = await uut.subtractTokensFromInputAddr(mockData.sendData02)
      // console.log('result: ', result)

      assert.equal(result, true)
    })
  })

  describe('#addUtxoToOutputAddr', () => {
    it('should return a new UTXO', async () => {
      const recvrAddr = 'bitcoincash:qqzewa0ljnm9cp8g56z8ua8tnqya3nthnvhv5hpu8y'
      const voutIndex = 1
      const slpAmountStr = '4354768657'
      const result = await uut.addUtxoToOutputAddr(mockData.sendData01, recvrAddr, voutIndex, slpAmountStr)
      // console.log('result: ', result)

      assert.hasAllKeys(result, [
        'txid',
        'vout',
        'type',
        'qty',
        'tokenId',
        'address'
      ])
    })

    it('should catch and throw errors', async () => {
      try {
        await uut.addUtxoToOutputAddr()

        assert.fail('Unexpected code path')
      } catch (err) {
        // console.log('err: ', err)
        assert.include(err.message, 'Cannot destructure property')
      }
    })
  })

  describe('#updateBalanceFromSend', () => {
    it('should update the balance of an address', () => {
      const startVal = parseInt(mockData.addrData01.balances[0].qty.toString())

      // console.log(`starting mockData.addrData01: ${JSON.stringify(mockData.addrData01, null, 2)}`)
      const result = uut.updateBalanceFromSend(mockData.addrData01, mockData.sendData01.slpData, 0)
      // console.log('result: ', result)

      const endVal = parseInt(mockData.addrData01.balances[0].qty.toString())

      assert.equal(result, true)

      // Assert that the balance of the address is greater after the function
      // completes.
      assert.isAbove(endVal, startVal)
    })

    it('should add new balance if token does not exist in address', () => {
      // Force existing balance to be for a different token
      mockData.addrData01.balances[0].tokenId = 'other-token'

      const result = uut.updateBalanceFromSend(mockData.addrData01, mockData.sendData01.slpData, 0)

      assert.equal(result, true)

      // console.log(`addrData: ${JSON.stringify(mockData.addrData01, null, 2)}`)
      assert.equal(mockData.addrData01.balances[0].qty, '234123')
      assert.equal(mockData.addrData01.balances[1].qty, '4354768657')
    })

    it('should ignore existing tokens', () => {
      // Add different token to starting balance
      mockData.addrData01.balances.unshift({
        tokenId: 'other-token',
        qty: new BigNumber('10000')
      })

      const result = uut.updateBalanceFromSend(mockData.addrData01, mockData.sendData01.slpData, 0)

      assert.equal(result, true)

      // console.log(`addrData: ${JSON.stringify(mockData.addrData01, null, 2)}`)
      assert.equal(mockData.addrData01.balances[0].qty, '10000')
      assert.equal(mockData.addrData01.balances[1].qty, '4355002780')
    })

    it('should catch and throw errors', async () => {
      try {
        await uut.updateBalanceFromSend()

        assert.fail('Unexpected code path')
      } catch (err) {
        // console.log('err: ', err)
        assert.include(err.message, 'Cannot read property')
      }
    })
  })

  describe('#updateOutputAddr', () => {
    it('should update the output address', async () => {
      // Force creation of new address object
      sandbox.stub(uut.addrDb, 'get').rejects(new Error('not found'))

      const result = await uut.updateOutputAddr(mockData.sendData01, 1)
      // console.log('result: ', result)

      assert.isArray(result.utxos)
      assert.isArray(result.txs)
      assert.isArray(result.balances)
    })

    it('should handle corner-case where scriptPubKey does not exist', async () => {
      // Force corner case
      delete mockData.sendData01.txData.vout[1].scriptPubKey

      const result = await uut.updateOutputAddr(mockData.sendData01, 1)
      // console.log('result: ', result)

      assert.equal(result, undefined)
    })

    it('should catch and throw errors', async () => {
      try {
        await uut.updateOutputAddr()

        assert.fail('Unexpected code path')
      } catch (err) {
        // console.log('err: ', err)
        assert.include(err.message, 'Cannot destructure property')
      }
    })
  })

  describe('#addTokensFromOutput', () => {
    it('should add tokens to output address', async () => {
      // Force creation of new address object
      sandbox.stub(uut.addrDb, 'get').rejects(new Error('not found'))

      const result = await uut.addTokensFromOutput(mockData.sendData01)
      // console.log('result: ', result)

      assert.equal(result, true)
    })

    it('should catch and throw errors', async () => {
      try {
        await uut.addTokensFromOutput()

        assert.fail('Unexpected code path')
      } catch (err) {
        // console.log('err: ', err)
        assert.include(err.message, 'Cannot destructure property')
      }
    })
  })

  describe('#processTx', () => {
    it('should process SEND data', async () => {
      // Mock dependencies
      sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: true })
      sandbox.stub(uut, 'subtractTokensFromInputAddr').resolves()
      sandbox.stub(uut, 'addTokensFromOutput').resolves()

      const result = await uut.processTx(mockData.sendData01)
      // console.log('result: ', result)

      assert.equal(result, true)
    })

    it('should mark tx as invalid if it fails DAG validation', async () => {
      // Mock dependencies
      sandbox.stub(uut.dag, 'crawlDag').resolves({ isValid: false })

      const result = await uut.processTx(mockData.sendData01)
      // console.log('result: ', result)

      assert.equal(result, undefined)
    })

    it('should catch and throw errors', async () => {
      try {
        await uut.processTx()

        assert.fail('Unexpected code path')
      } catch (err) {
        // console.log('err: ', err)
        assert.include(err.message, 'Cannot destructure property')
      }
    })
  })
})