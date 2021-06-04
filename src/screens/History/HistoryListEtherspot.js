// @flow
/*
    Pillar Wallet: the personal data locker
    Copyright (C) 2021 Stiftung Pillar Project

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
/* eslint-disable i18next/no-literal-string */

import * as React from 'react';

// Components
import HistoryList from 'components/HistoryList';

// Selectors
import {
  activeAccountAddressSelector,
  supportedAssetsSelector,
  useRootSelector,
} from 'selectors';
import { accountHistorySelector } from 'selectors/history';
import { accountAssetsSelector } from 'selectors/assets';
import { accountCollectiblesHistorySelector } from 'selectors/collectibles';

// Utils
import { getHistoryEventsFromTransactions, parseHistoryEventFee } from 'utils/history';
import { addressesEqual, getAssetsAsList } from 'utils/assets';

// Types
import { EVENT_TYPE, type Event } from 'models/History';

function HistoryListEtherspot() {
  const items = useHistoryEvents();

  return <HistoryList items={items} />;
}

export default HistoryListEtherspot;

function useHistoryEvents(): Event[] {
  const activeAccountAddress = useRootSelector(activeAccountAddressSelector);
  const transactionsHistory = useRootSelector(accountHistorySelector);
  const accountAssets = getAssetsAsList(useRootSelector(accountAssetsSelector));
  const supportedAssets = useRootSelector(supportedAssetsSelector);
  const collectiblesHistory = useRootSelector(accountCollectiblesHistorySelector);

  const mappedCollectiblesHistory = collectiblesHistory.map(({
    _id,
    hash,
    batchHash,
    createdAt,
    from: fromAddress,
    to: toAddress,
    icon: imageUrl,
    status,
    asset: title,
    feeWithGasToken,
    gasUsed,
    gasPrice,
  }) => {
    const fee = parseHistoryEventFee(feeWithGasToken, gasUsed, gasPrice);
    const eventType = addressesEqual(fromAddress, activeAccountAddress)
      ? EVENT_TYPE.COLLECTIBLE_SENT
      : EVENT_TYPE.COLLECTIBLE_RECEIVED;

    return {
      id: _id,
      hash,
      batchHash,
      date: new Date(+createdAt * 1000),
      fromAddress,
      toAddress,
      imageUrl,
      type: eventType,
      status,
      title,
      fee,
    };
  });

  const mappedTransactionsHistory = getHistoryEventsFromTransactions(
    transactionsHistory,
    activeAccountAddress,
    accountAssets,
    supportedAssets,
  );

  return [
    ...mappedTransactionsHistory,
    ...mappedCollectiblesHistory,
  ];
}
