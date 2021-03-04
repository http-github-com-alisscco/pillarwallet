// @flow
/*
    Pillar Wallet: the personal data locker
    Copyright (C) 2019 Stiftung Pillar Project

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
*/
import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';
import type { NavigationScreenProp } from 'react-navigation';
import t from 'translations/translate';

// actions
import { fetchAccountDepositBalanceAction } from 'actions/etherspotActions';

// components
import SendContainer from 'containers/SendContainer';
import { Label } from 'components/Typography';

// constants
import { PPN_TOKEN } from 'configs/assetsConfig';
import { SEND_TOKEN_CONFIRM } from 'constants/navigationConstants';

// utils
import { getAssetData, getAssetsAsList } from 'utils/assets';

// selectors
import { contactsSelector } from 'selectors';
import { accountAssetsSelector } from 'selectors/assets';
import { availableStakeSelector } from 'selectors/paymentNetwork';

// types
import type { Dispatch } from 'reducers/rootReducer';
import type { Assets, Balances } from 'models/Asset';
import type { Contact } from 'models/Contact';
import type { TokenTransactionPayload } from 'models/Transaction';


type Props = {
  navigation: NavigationScreenProp<*>,
  accountAssets: Assets,
  availableStake: number,
  contacts: Contact[],
  fetchAccountDepositBalance: () => void,
};

const PPNSendTokenAmount = ({
  navigation,
  accountAssets,
  availableStake,
  contacts,
  fetchAccountDepositBalance,
}: Props) => {
  useEffect(() => {
    fetchAccountDepositBalance();
  }, []);

  const [amount, setAmount] = useState(null);
  const [inputValid, setInputValid] = useState(false);
  const [selectedContact, setSelectedContact] = useState<?Contact>(null);

  const PPNAsset = getAssetData(getAssetsAsList(accountAssets), [], PPN_TOKEN);

  const { symbol, address: contractAddress, decimals } = PPNAsset;

  // for selector
  const PPNAssetDataOption = { ...PPNAsset, value: symbol };

  const showNextButton = amount !== null; // only if amount input touched
  const isNextButtonDisabled = !amount || !inputValid || !selectedContact;
  const onNextButtonPress = () => {
    if (!selectedContact || !amount) {
      // TODO: show toast
      return;
    }

    const transactionPayload: TokenTransactionPayload = {
      to: selectedContact.ethAddress,
      amount,
      txFeeInWei: 0,
      usePPN: true,
      symbol,
      contractAddress,
      decimals,
    };

    const { ensName } = selectedContact;
    if (ensName) transactionPayload.receiverEnsName = ensName;

    navigation.navigate(SEND_TOKEN_CONFIRM, { transactionPayload });
  };

  const accountDepositBalance: Balances = { [PPN_TOKEN]: { symbol: PPN_TOKEN, balance: availableStake.toString() } };

  return (
    <SendContainer
      customSelectorProps={{
        contacts,
        selectedContact,
        onSelectContact: setSelectedContact,
      }}
      customValueSelectorProps={{
        onValueChange: setAmount,
        assetData: PPNAssetDataOption,
        value: amount || '', // cannot be null
        customAssets: [],
        customBalances: accountDepositBalance,
        onFormValid: setInputValid,
      }}
      footerProps={{
        isNextButtonVisible: showNextButton,
        buttonProps: {
          onPress: onNextButtonPress,
          disabled: isNextButtonDisabled,
        },
        footerTopAddon: <Label small>{t('ppnContent.label.paidByPillar')}</Label>,
      }}
    />
  );
};

const structuredSelector = createStructuredSelector({
  contacts: contactsSelector,
  accountAssets: accountAssetsSelector,
  availableStake: availableStakeSelector,
});

const mapDispatchToProps = (dispatch: Dispatch): $Shape<Props> => ({
  fetchAccountDepositBalance: () => dispatch(fetchAccountDepositBalanceAction()),
});

export default connect(structuredSelector, mapDispatchToProps)(PPNSendTokenAmount);

