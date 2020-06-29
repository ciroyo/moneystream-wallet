'use strict'
import FileSystemStorage, { IStorage } from './FileSystemStorage'
import IndexingService, {IIndexingService} from './IndexingService'
import { Address, Sig } from 'bsv'
import { KeyPair } from './KeyPair'
import { TransactionBuilder } from './TransactionBuilder'
import { OutputCollection } from './OutputCollection'
import { UnspentOutput } from './UnspentOutput'

// base class for streaming wallet
// A wallet generates transactions
// TODO: extract wallet storage into separate class
// TODO: extract debugging formatting into separate class
export class Wallet {
    protected readonly FINAL:number = 0xffffffff
    public _isDebug: boolean
    protected _walletFileName: string
    protected _dustLimit: number
    //true if user can combine inputs to extend session
    protected _allowMultipleInputs: boolean = true
    protected _fundingInputCount?: number
    //outputs that this wallet needs to deal with
    //could be outputs for our wallet
    //or others, if we import tx from others
    //txoutmap is collection to know the value of the TxIn
    //txbuilder has reference to txoutmap, use that instead?
    //private _txOutMap:any
    // a previously encumbered utxo
    _selectedUtxos: OutputCollection = new OutputCollection()
    //wallet pub/priv key pair for signing tx
    _keypair!: KeyPair
    //the last transaction this wallet made
    lastTx: any
    // certifies "I am signing for my input and output, 
    // anyone else can add inputs and outputs"
    protected SIGN_MY_INPUT = 
        Sig.SIGHASH_SINGLE 
        | Sig.SIGHASH_ANYONECANPAY
        | Sig.SIGHASH_FORKID
    // storage for keys
    protected _storage: IStorage
    protected _index: IIndexingService

    constructor() {
        this._isDebug = true
        this._walletFileName = 'wallet.json'
        this._dustLimit = 500
        this._storage = new FileSystemStorage(this._walletFileName)
        this._index = new IndexingService()
    }

    get keyPair() { return this._keypair }
    get selectedUtxos() { return this._selectedUtxos }
    set selectedUtxos(val) { this._selectedUtxos = val }

    get balance():number {
        if (!this._selectedUtxos) return 0
        return this.selectedUtxos.satoshis()
    }

    txInDescription(txIn:any, index:number) {
        const inputValue = this.getInputOutput(txIn)?.satoshis
        const inputSeq = txIn.nSequence || this.FINAL
        const inputPrevHash = txIn.txHashBuf.toString('hex')
        const inputPrevIndex = txIn.txOutNum
        const inputPrevHashCondensed = `${inputPrevHash.slice(0,4)}...${inputPrevHash.slice(-4)}:${inputPrevIndex}`
        const signingText = (txIn.constructor.name === 'Input' ? `CANNOT SIGN ABSTRACT! `:'')
            + txIn.constructor.name
        return {value:inputValue, desc:`[${index}]${inputValue}:${inputSeq === this.FINAL?'Final':inputSeq.toString()} spends ${inputPrevHashCondensed} Type:${signingText}`}
    }

    //get the txout that the txin is spending
    getInputOutput(txin:any):any {
        //txout being spent will probably be in _selectedUtxos
        return this._selectedUtxos.find(txin.txHashBuf, txin.txOutNum)
    }

    getTxFund(tx:any):number {
        let fundingTotal = 0
        if (tx.txIns.length > 0 && tx.txOuts.length > 0) {
            const len = this._fundingInputCount || tx.txIns.length
            for (let index = 0; index < len; index++) {
                const txin = tx.txIns[index]
                const txout = tx.txOuts[index]
                const txInputOut = this.getInputOutput(txin)
                fundingTotal += (txInputOut ? txInputOut.satoshis:0) - txout.valueBn.toNumber()
            }
        }
        return fundingTotal
    }

    logDetailsLastTx() {
        this.logDetails(this.lastTx)
    }
    logDetails(tx?: any) {
        let details = ""
        details += `\n${this._keypair.toWif()}`
        details += `\n${this._keypair.toXpub()}`
        details += `\n${this._keypair.toAddress().toString()}`
        if (tx) {
            //TODO: translate locktime to date time
            details += `\nLocked until ${tx.nLockTime}`
            if (tx.txIns && tx.txIns.length > 0) {
                details += `\nInputs ${tx.txIns.length}`
            }
            let inputTotal = 0
            for (let i = 0; i < tx.txIns.length; i++) {
                const txIn = tx.txIns[i]
                const {value,desc} = this.txInDescription(txIn, i)
                details += `\n   ${desc}`
                inputTotal += value
            }
            if (inputTotal) details += `\nTotal In:${inputTotal}`
            if (tx.txOuts && tx.txOuts.length > 0) {
                details += `\nOutputs ${tx.txOuts.length}`
            }
            let platformTotal = 0
            let outputTotal = 0
            for (let i = 0; i < tx.txOuts.length; i++) {
                const txout = tx.txOuts[i]
                const satoshis = txout.valueBn.toNumber()
                details += `\n   [${i}]${satoshis}`
                outputTotal += satoshis
                if (i > 2) platformTotal += satoshis
            }
            if (outputTotal) details += `\nTotal Out:${outputTotal}`
            const fund = this.getTxFund(tx)
            details += `\nFunding:${fund}`
            platformTotal = fund
            details += `\nPlatform:${platformTotal}`
            const minerFee = inputTotal - outputTotal - platformTotal
            details += `\nMiner Fee:${minerFee}`
            //TODO: add back to bsv2
            //details += `\nFullySigned?${tx.isFullySigned()}`
        }
        console.log(details)
    }

    toJSON() {
        const walletjson = {
            "wif": this._keypair.toWif(),
            "xpub": this._keypair.toXpub(),
            "address": this._keypair.toAddress().toString()
        }
        return walletjson
    }

    loadWallet(wif?:string) {
        if (wif) {
            this._keypair = new KeyPair().fromWif(wif)
        } else {
            // try to load wallet from storage?
        }
        if (!this._keypair) {
            this.generateKey()
        }
    }

    generateKey() {
        this._keypair = new KeyPair().fromRandom()
        return this._keypair.pubKey.toString()
    }

    store(wallet:any) {
        const sWallet = JSON.stringify(wallet, null, 2)
        this._storage.put(sWallet)
        return wallet
    }

    logUtxos(utxos:any) {
        let logit = `In ${this.constructor.name} ${utxos.length} Unspent outputs`
        let tot = 0
        for (let i:number = 0; i<utxos.length; i++) {
            const utxo = utxos[i]
            logit += `\n${utxo.satoshis}x${utxo.txId.slice(0,4)}...${utxo.txId.slice(-4)}:${utxo.outputIndex}`
            tot += utxo.satoshis
        }
        logit += `\nTotal:${tot}`
        console.log(logit)
    }

    //todo cache utxos
    async getAnUnspentOutput(): Promise<any> {
        if (!this._selectedUtxos.hasAny()) {
            const utxos = await this._index.getUtxosAPI(this._keypair.toAddress())
            if (utxos && utxos.length > 0) {
                for(let i=0; i<utxos.length; i++)
                {
                    const utxo0 = utxos[i]
                    const newutxo = new UnspentOutput(
                        utxo0.value, 
                        this._keypair.toOutputScript(),
                        Buffer.from(utxo0.tx_hash,'hex').reverse().toString('hex'),
                        utxo0.tx_pos
                        )
                    this._selectedUtxos.add(newutxo)
                }
            }
        }
        return this._selectedUtxos
    }

    // legacy p2pkh spend
    async makeSimpleSpend(satoshis: Long): Promise<string> {
        if (!this._keypair) { throw new Error('Load wallet before spending') }
        const utxos = await this.getAnUnspentOutput()
        if (!utxos || utxos.length < 0) {
            throw Error(`insufficient wallet funds.`)
        }
        const utxoSatoshis: number = utxos.satoshis()
        const changeSatoshis = utxoSatoshis - satoshis.toNumber()
        if (changeSatoshis < 0) {
            throw Error(`the utxo ran out of money ${changeSatoshis}`)
        }
        const txb = new TransactionBuilder()
            .from(this._selectedUtxos.items, this._keypair.pubKey)
            .toAddress(changeSatoshis, this._keypair.toAddress())
            .change(this._keypair.toAddress())
        //txb.sign(this._keypair)
        this.lastTx = txb.buildAndSign(this._keypair)
        return this.lastTx.toHex()
        // tx can be broadcast and put on chain
    }

    //tries to load utxos for wallet and
    //throws error if it cannot get any
    async tryLoadWalletUtxos() {
        if (!this._selectedUtxos.hasAny()) await this.getAnUnspentOutput()
        if (!this._selectedUtxos.hasAny()) {
            throw Error('Manager wallet does not have available utxo!')
        }
    }

    // standard method for a streaming wallet
    async makeAnyoneCanSpendTx(satoshis:Long, payTo?:string, makeFuture:boolean = true) {
        await this.tryLoadWalletUtxos()
        //from all possible utxos, select enough to pay amount
        const filteredUtxos = this._selectedUtxos.filter(satoshis)
        this._fundingInputCount = filteredUtxos.count()
        //console.log(this._fundingInputCount)
        const utxoSatoshis = filteredUtxos.satoshis()
        const changeSatoshis = utxoSatoshis - satoshis.toNumber()
        if (changeSatoshis < 0) {
            throw Error(`the utxo ran out of money ${changeSatoshis}`)
        }
        const txb = new TransactionBuilder()
        txb.setChangeAddress(this._keypair.toAddress())
        //TODO: for now, inputs have to be more than dust limit!
        const dustTotal = filteredUtxos.count() * this._dustLimit
        //add range of utxos, change in first, others are dust
        //TODO: could spread them out?
        for (let index = 0; index < this._fundingInputCount; index++) {
            const element = filteredUtxos.items[index]
            const inputCount = txb.addInput(element, this._keypair.pubKey, this.SIGN_MY_INPUT)
            if (inputCount !== index + 1) throw Error(`Input did not get added!`)
            //TODO: need many more unit tests
            let outSatoshis = this._dustLimit
            if (index === 0) {
                if (filteredUtxos.count() < 2) {
                    // only one output, put all change there
                    outSatoshis = Math.max(changeSatoshis,0)
                } else {
                    outSatoshis = Math.max(changeSatoshis-dustTotal,0)
                }
            }
            if (outSatoshis >= 0) {
                //console.log(outSatoshis)
                txb.addOutput(
                    outSatoshis, 
                    this._keypair.toAddress()
                )
            }
        }
        //balance goes to payto address
        //payout address is not signed
        if (payTo) {
            txb.addOutput(
                satoshis.toNumber(),
                Address.fromString(payTo)
            )
        }
        this.lastTx = txb.buildAndSign(this._keypair, makeFuture)
        return this.lastTx.toHex()
        // at this point, tx is spendable by anyone!
        // only pass it through secure channel to recipient
        // tx needs further processing before broadcast
    }

    // attempt to split utxos, trying to create
    // the targeted number of outputs with at least
    // the minimum number of satoshis in each one
    // on a best effort basis
    async split(targetCount:number, satoshis:number) {
        const minSatoshis = Math.max(satoshis,this._dustLimit)
        //get utxos not emcumbered
        await this.tryLoadWalletUtxos()
        //from all possible utxos, 
        const splits = this._selectedUtxos.split(targetCount, minSatoshis)
        //only ones greater than min or dust
        if (splits.utxo.satoshis > 0) {
            splits.breakdown.lastItem.satoshis -= this._dustLimit
            const txb = new TransactionBuilder()
            txb.addInput(splits.utxo, this._keypair.pubKey)
            for (let index = 0; index < splits.breakdown.items.length; index++) {
                const split = splits.breakdown.items[index]
                txb.addOutput(split.satoshis, this._keypair.toAddress())
            }
            this.lastTx = txb.buildAndSign(this._keypair)
            return this.lastTx.toHex()
        }
    }
}
