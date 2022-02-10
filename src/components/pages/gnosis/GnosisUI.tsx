import { Button, Col, Input, Row } from 'antd';
import { BigNumber, BigNumberish, BytesLike } from 'ethers';
import React, { useState, FC, useContext, SetStateAction, useReducer } from 'react';

import { transactor } from 'eth-components/functions';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { useEthersContext } from 'eth-hooks/context';
import { useGasPrice } from 'eth-hooks';
import { EthComponentsSettingsContext } from 'eth-components/models';
import { useAppContracts } from '~~/config/contractContext';
import { AddressInput } from 'eth-components/ant';
import { CloseOutlined } from '@ant-design/icons';
// import { SetPurposeEvent, YourContract } from '~~/generated/contract-types/YourContract';

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface IGnosisUIProps {
  mainnetProvider: StaticJsonRpcProvider | undefined;
  yourCurrentBalance: BigNumber | undefined;
  price: number;
}

interface OwnerDetails {
  key: string;
  address: string;
}

interface IState {
  owners: OwnerDetails[];
  threshold: number;
}

const stateReducer = (state: IState, action: any) => {
  console.log('stateReducerCalled - pre', { state: JSON.stringify(state), action: JSON.stringify(action) })
  switch (action.type) {
    case 'update': 
      const owner = state.owners.find(el => el.key === action.key);
      if (!owner) { throw new Error('Element not found')};
      owner.address = action.value;
      break;
    
    case 'new': 
      const newOwner: OwnerDetails = { key: Math.floor(Math.random()*1000000).toString(), address: ''};
      state.owners = [...state.owners.concat(newOwner)];
      console.log('new()', { newOwner, state: JSON.stringify(state)});
      break;

    case 'remove': 
      state.owners = state.owners.filter(el => {
        return el.key !== action.key
      })
      break;

  }
  console.log('stateReducerCalled - post', { state: JSON.stringify(state), action: JSON.stringify(action) })
  return {...state};
}

export const GnosisUI: FC<IGnosisUIProps> = (props) => {
  const ethersContext = useEthersContext();

  const proxyFactory = useAppContracts('GnosisSafeProxyFactory', ethersContext.chainId);
  const masterCopy = useAppContracts('GnosisSafe', ethersContext.chainId);
  const fallbackHandler = useAppContracts('DefaultCallbackHandler', ethersContext.chainId);

  const ethComponentsSettings = useContext(EthComponentsSettingsContext);
  const [gasPrice] = useGasPrice(ethersContext.chainId, 'fast');
  const tx = transactor(ethComponentsSettings, ethersContext?.signer, gasPrice);

  const { mainnetProvider, yourCurrentBalance, price } = props;

  /** State Management */
  const [state, dispatch] = useReducer(stateReducer, { owners: [], threshold: 1});
  const [threshold, setThreshold] = useState(1);
  
  /** --- */

  const deploySafe = async () => {
    const safeAccounts = state.owners.map(ow => ow.address); 
    
    if(!tx) throw new Error('tx not found');

    if(!masterCopy) throw new Error('masterCopy not found');
    if(!proxyFactory) throw new Error('proxyFactory not found');
    if(!fallbackHandler) throw new Error('fallbackHandler not found');

    const params: [
      string[],
      BigNumberish,
      string,
      BytesLike,
      string,
      string,
      BigNumberish,
      string
    ] = [ 
      safeAccounts, 
      threshold, 
      ZERO_ADDRESS, 
      "0x", 
      fallbackHandler.address, 
      ZERO_ADDRESS, 
      0, 
      ZERO_ADDRESS 
    ];
    
    // proxy deployment
    const safeAbi = masterCopy.interface.encodeFunctionData(
      'setup', params
    );
    /* look how you call setPurpose on your contract: */
    /* notice how you pass a call back for tx updates too */

    const txCaller = tx(proxyFactory.createProxy(masterCopy.address, safeAbi), (update: any) => {
      console.log('Transaction Update:', update);
      
      if (update && (update.status === 'confirmed' || update.status === 1)) {
        console.log(' 🍾 Transaction ' + update.hash + ' finished!');
        console.log(
          ' ⛽️ ' +
            update.gasUsed +
            '/' +
            (update.gasLimit || update.gas) +
            ' @ ' +
            parseFloat(update.gasPrice) / 1000000000 +
            ' gwei'
        );
      }
    });
    const res = await txCaller;
    console.log({res});
  }

  const ownerChanged = (key: string, value: string) => {
    dispatch({type: 'update', key, value})
  }

  const ownerRemoved = (key: string) => {
    dispatch({type: 'remove', key})
  }

  console.log('GnosisUI render()', JSON.stringify(state))

  return (
    <div>
      {/* <p>Proxy address {proxyFactory?.address}</p>
      <p>MasterCopy address {masterCopy?.address}</p> */}
      {state.owners.map((owner: OwnerDetails) => {
        return (
          <Row key={owner.key} >
            <Col span={22}>
              <AddressInput ensProvider={undefined} address={owner.address} onChange={(value) => ownerChanged(owner.key, value.toString())}></AddressInput>
            </Col>
            <Col span={2}>
              <Button icon={<CloseOutlined />} onClick={() => ownerRemoved(owner.key)}/>
            </Col>
          </Row>
        )
      })}

      <Input type="number" onChange={(v) => setThreshold(parseInt(v.currentTarget.value))}></Input>
      
      <Button onClick={() => dispatch({type: 'new'})}>Add owner</Button> 
      <br></br>
      <Button onClick={deploySafe} type="primary">Deploy Safe</Button>
      
    </div>
  );
};
