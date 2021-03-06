import { Wallet } from '../../src/Wallet'
import * as Long from 'long'
import { KeyPair } from '../../src/KeyPair'
import { OutputCollection } from '../../src/OutputCollection'
import { UnspentOutput } from '../../src/UnspentOutput'
import { Bn, Script, TxOut } from 'bsv'

const dustLimit = 500
const someHashBufString = '1aebb7d0776cec663cbbdd87f200bf15406adb0ef91916d102bcd7f86c86934e'
const dummyOutput1 = new UnspentOutput(
    1000, 
    new KeyPair().fromRandom().toOutputScript(),
    someHashBufString,
    0
  )
  const dummyOutput2 = new UnspentOutput(
    2000, 
    new KeyPair().fromRandom().toOutputScript(),
    someHashBufString,
    1
  )
  
  function makeDummyTwo() {
    const dummyUtxosTwo = new OutputCollection()
    dummyUtxosTwo.add(new UnspentOutput(
      1000, 
      new KeyPair().fromRandom().toOutputScript(),
      someHashBufString,
      0
    ))
    //.filter will sort by sats and use #2 before #1
    dummyUtxosTwo.add(new UnspentOutput(
      2000, 
      new KeyPair().fromRandom().toOutputScript(),
      someHashBufString,
      1
    ))
    return dummyUtxosTwo
  }

  function createUtxos(count:number, satoshis:number):OutputCollection {
    const lotsOfUtxos = new OutputCollection()
    for (let index = 0; index < count; index++) {
      const testUtxo = new UnspentOutput(
        satoshis,
        new KeyPair().fromRandom().toOutputScript(),
        someHashBufString,
        index
      )
      lotsOfUtxos.add(testUtxo)
    }
    return lotsOfUtxos
  }

  // tx with no inputs and no outputs
  const nofundinghex = '0100000000000d1b345f'

describe('Wallet tests', () => {
  it('should instantiate a wallet object', () => {
    const w = new Wallet()
    expect(w).toBeInstanceOf(Wallet)
  })
  it('should error if wallet not loaded', async () => {
    const w = new Wallet()
    w.selectedUtxos = createUtxos(1,1000)
    await expect(
      w.makeSimpleSpend(Long.fromNumber(600))
    ).rejects.toThrow(Error)
  })
  it('should spend to address', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const buildResult = await w.makeSimpleSpend(Long.fromNumber(600), undefined, '1SCVmCzdLaECeRkMq3egwJ6yJLwT1x3wu')
    expect(buildResult.hex).toBeDefined()
    expect(buildResult.tx.txOuts[0].valueBn.toNumber()).toBe(600)
  })
  it('should clear wallet', () => {
    const w = new Wallet()
    w.selectedUtxos = createUtxos(1,1000)
    expect(w.balance).toBe(1000)
    w.clear()
    expect(w.balance).toBe(0)
    expect(w.selectedUtxos.hasAny()).toBeFalsy()
  })
  it('should create simple tx with no lock time', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)

    const buildResult = await w.makeSimpleSpend(Long.fromNumber(600))
    expect (buildResult.hex.length).toBeGreaterThan(20)
    expect (buildResult.tx.nLockTime).toBe(0)
    expect (buildResult.tx.txIns.length).toBeGreaterThan(0)
    expect (buildResult.tx.txOuts.length).toBeGreaterThan(0)
    expect(buildResult.tx.txOuts[0].valueBn.toNumber()).toBe(600)
    w.logDetailsLastTx()
  })
  it('should create streamable tx with lock time', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const buildResult = await w.makeStreamableCashTx(
      Long.fromNumber(1000)
    )
    expect (buildResult.hex.length).toBeGreaterThan(20)
    expect (buildResult.tx.nLockTime).toBeGreaterThan(0)
    expect (buildResult.tx.txIns.length).toBeGreaterThan(0)
    expect (buildResult.tx.txOuts.length).toBe(0)
    expect(w.getTxFund(buildResult.tx)).toBe(1000)
    // add extra output
    buildResult.tx.addTxOut(new Bn().fromNumber(1), new KeyPair().fromRandom().toOutputScript())
    // funding should not change
    expect(w.getTxFund(buildResult.tx)).toBe(1000)
  })
  it('should create streamable tx with no lock time', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const buildResult = await w.makeStreamableCashTx(
      Long.fromNumber(1000), undefined, false
    )
    expect (buildResult.hex.length).toBeGreaterThan(20)
    expect (buildResult.tx.nLockTime).toBe(0)
    expect (buildResult.tx.txIns.length).toBeGreaterThan(0)
    expect (buildResult.tx.txOuts.length).toBe(0)
  })
  it('should create streamable tx with one input', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = makeDummyTwo()
    const buildResult = await w.makeStreamableCashTx(
      Long.fromNumber(dummyOutput1.satoshis-dustLimit-1)
    )
    expect (buildResult.hex.length).toBeGreaterThan(20)
    expect (buildResult.tx.txIns.length).toBe(1)
    expect (buildResult.tx.txOuts.length).toBe(1)
  })
  it('should create streamable tx with exact input', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = makeDummyTwo()
    const tokensLessDust = 1000 - 500
    const buildResult = await w.makeStreamableCashTx(
      Long.fromNumber(tokensLessDust),
      new KeyPair().fromRandom().toOutputScript()
    )
    expect (buildResult.hex.length).toBeGreaterThan(20)
    expect (buildResult.tx.txIns.length).toBe(1)
    expect (buildResult.tx.txOuts.length).toBe(2)
  })

  it('should create streamable tx with multiple inputs', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = makeDummyTwo()
    //wallet will sort utxo by sats, use biggest first
    const buildResult = await w.makeStreamableCashTx(Long.fromNumber(2500))
    expect(buildResult.hex.length).toBeGreaterThan(20)
    expect(buildResult.tx.txIns.length).toBe(2)
    expect(buildResult.tx.txOuts.length).toBe(1)
    expect(buildResult.tx.txOuts[0].valueBn.toNumber()).toBe(500)
    expect(w.getTxFund(w.lastTx)).toBe(2500)
    // add an output, funding doesnt change
    buildResult.tx.addTxOut(new Bn().fromNumber(100), w.keyPair.toOutputScript()) 
    expect(w.getTxFund(w.lastTx)).toBe(2500)
  })
  it('should create streamable tx with increasing', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = makeDummyTwo()
    //wallet will sort utxo by sats, use biggest first
    const buildResult = await w.makeStreamableCashTx(Long.fromNumber(100))
    expect(buildResult.hex.length).toBeGreaterThan(20)
    expect(buildResult.tx.txIns.length).toBe(1)
    expect(buildResult.tx.txOuts.length).toBe(1)
    expect(buildResult.tx.txOuts[0].valueBn.toNumber()).toBe(1900)
    //expect(buildResult.tx.txOuts[1].valueBn.toNumber()).toBe(500)
    expect(w.getTxFund(w.lastTx)).toBe(100)
    const buildResult2 = await w.makeStreamableCashTx(
        Long.fromNumber(2100),null,true,buildResult.utxos
      )
    expect(buildResult2.hex.length).toBeGreaterThan(20)
    expect(buildResult2.tx.txIns.length).toBe(2)
    w.logDetailsLastTx()
    expect(w.getTxFund(buildResult2.tx)).toBe(2100)
    expect(buildResult2.tx.txOuts.length).toBe(1)
    expect(buildResult2.tx.txOuts[0].valueBn.toNumber()).toBe(900)
  
  })
  it('funds tx with one input', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const buildResult = await w.makeStreamableCashTx(Long.fromNumber(100))
    expect(buildResult.tx).toBeDefined()
    expect(w.getTxFund(w.lastTx)).toBe(100)
  })
  it ('should log utxos', () => {
    const w = new Wallet()
    w.selectedUtxos = makeDummyTwo()
    w.logUtxos(w.selectedUtxos.items)
  })
  it('should create tx to split a utxo', async () => {
    const w = new Wallet()
    w.loadWallet()
    const utxos = new OutputCollection()
    utxos.add(new UnspentOutput(10000,w.keyPair.toOutputScript(),someHashBufString,0))
    w.selectedUtxos = utxos
    // 10000-546/10
    const buildResult = await w.split(10,1000)
    expect(buildResult?.tx.txIns.length).toBe(1)
    expect(buildResult?.tx.txOuts.length).toBe(10)
    expect(buildResult?.tx.txOuts[0].valueBn.toNumber()).toBe(945)
    expect(buildResult?.tx.txOuts[9].valueBn.toNumber()).toBe(945)
    // fee will be 10000 - 945*10
  })
  it('should create tx to split a utxo', async () => {
    const w = new Wallet()
    w.loadWallet()
    const utxos = new OutputCollection()
    utxos.add(new UnspentOutput(3611,w.keyPair.toOutputScript(),someHashBufString,0))
    utxos.add(new UnspentOutput(3450,w.keyPair.toOutputScript(),someHashBufString,1))
    utxos.add(new UnspentOutput(5323,w.keyPair.toOutputScript(),someHashBufString,2))
    utxos.add(new UnspentOutput(2987,w.keyPair.toOutputScript(),someHashBufString,3))
    utxos.add(new UnspentOutput(2987,w.keyPair.toOutputScript(),someHashBufString,4))
    utxos.add(new UnspentOutput(2487,w.keyPair.toOutputScript(),someHashBufString,5))
    w.selectedUtxos = utxos
    const total = 5323 //utxos.satoshis
    const count = 7
    const splitAmount = Math.floor(total/count)
    const buildResult = await w.split(count,600)
    expect(buildResult?.tx.txIns.length).toBe(1)
    expect(buildResult?.tx.txOuts.length).toBe(count)
    expect(buildResult?.tx.txOuts[0].valueBn.toNumber()).toBe(600)
    expect(buildResult?.tx.txOuts[count-1].valueBn.toNumber()).toBeGreaterThan(545)
    expect(splitAmount).toBeGreaterThan(545)
    //TODO: make sure fee is reasonable before broadcast
    w.logDetails(buildResult?.tx)
  })
  it('should get wallet balance', async () => {
    const w = new Wallet()
    w.loadWallet()
    const lotsOfUtxos = createUtxos(9,1)
    expect(lotsOfUtxos.count).toBe(9)
    w.selectedUtxos = lotsOfUtxos
    expect(w.balance).toBe(9)
  })
  it('should create streamable tx with more than 256 inputs', async () => {
    const size = 258
    const w = new Wallet()
    w.loadWallet()
    const lotsOfUtxos = createUtxos(size,1000)
    expect(lotsOfUtxos.count).toBe(size)
    w.selectedUtxos = lotsOfUtxos
    const buildResult = await w.makeStreamableCashTx(
      Long.fromNumber(size*1000)
    )
    expect (buildResult.hex.length).toBeGreaterThan(20)
    expect (buildResult?.tx.nLockTime).toBeGreaterThan(0)
    expect (buildResult?.tx.txIns.length).toBe(size)
    expect (buildResult?.tx.txOuts.length).toBe(0)
  })
  it('encumbers utxo', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const buildResult = await w.makeStreamableCashTx(Long.fromNumber(100))
    expect(buildResult?.tx).toBeDefined()
    expect(w.getTxFund(w.lastTx)).toBe(100)
    expect(w.selectedUtxos.firstItem.status).toBe('hold')
  })
  it('errors multiple streams one utxo', async () => {
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const stream1 = await w.makeStreamableCashTx(Long.fromNumber(100))
    expect(stream1.tx).toBeDefined()
    expect(w.getTxFund(w.lastTx)).toBe(100)
    expect(w.selectedUtxos.firstItem.status).toBe('hold')
    //this should error because single utxo already encumbered
    expect(
      w.makeStreamableCashTx(Long.fromNumber(100))
    ).rejects.toThrow(Error)
  })
  it ('should error making empty transaction', async () => {
    const w = new Wallet()
    expect(w).toBeInstanceOf(Wallet)
    w.loadWallet()
    // should error because stream cannot be funded
    // at all
    expect(
      w.makeStreamableCashTx(
        Long.fromNumber(250),
        null,true, new OutputCollection()
      )
    ).rejects.toThrow(Error)
  })
  it('tests funding zero', async () => {
    const w = new Wallet()
    w.allowZeroFunding = true
    w.loadWallet()
    w.selectedUtxos = new OutputCollection()
    const buildResult = await w.makeStreamableCashTx(Long.fromNumber(0))
    expect(buildResult?.tx).toBeDefined()
    expect(w.fundingInputCount).toBe(0)
    expect(w.getTxFund(buildResult.tx)).toBe(0)
    expect(w.senderOutputCount).toBe(0)
    buildResult.tx.addTxIn(someHashBufString,0, new Script())
    const utxo = UnspentOutput.fromTxOut(
      TxOut.fromProperties(
        new Bn(999), 
        w.keyPair.toOutputScript()
      ), someHashBufString,0
    )
    w.selectedUtxos.add(utxo)
    buildResult.tx.addTxOut(new Bn().fromNumber(100), w.keyPair.toOutputScript()) 
    w.logDetailsLastTx()
    expect(w.senderOutputCount).toBe(0)
    expect(w.fundingInputCount).toBe(0)
    const txinout = w.getInputOutput(buildResult.tx.txIns[0],0)
    expect(txinout).toBeInstanceOf(UnspentOutput)
    expect(w.getTxFund(buildResult.tx)).toBe(0)
  })
  it('tests funding more', async () => {
    // what to do if user wants to make tx with 0 funding?
    const w = new Wallet()
    w.loadWallet()
    w.selectedUtxos = createUtxos(1,1000)
    const buildResult = await w.makeStreamableCashTx(Long.fromNumber(0))
    expect(buildResult?.tx).toBeDefined()
    expect(w.fundingInputCount).toBe(1)
    expect(w.senderOutputCount).toBe(1)
    expect(w.getTxFund(buildResult.tx)).toBe(0)
    // add more inputs and outputs, not part of funding
    buildResult.tx.addTxIn(someHashBufString,0, new Script()) 
    buildResult.tx.addTxOut(new Bn().fromNumber(100), w.keyPair.toOutputScript()) 
    expect(w.senderOutputCount).toBe(1)
    expect(w.fundingInputCount).toBe(1)
    w.logDetailsLastTx()
    expect(w.getTxFund(buildResult.tx)).toBe(0)
  })

})
