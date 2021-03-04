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
import t from 'translations/translate';

// components
import Toast from 'components/Toast';

// types
import type { Contact } from 'models/Contact';

// services
import etherspot from 'services/etherspot';

// utils
import { reportLog, resolveEnsName } from './common';
import { isValidAddress, isEnsName } from './validators';

type ResolveContactOptions = {|
  showNotification: boolean;
|};

/**
 * Returns contact with resolved `ethAddress` (from ENS name).
 *
 * If `ethAddress` is ENS name it will be resolved.
 * If `ethAddress` is a valid hex address this will return the input.
 *
 * @returns {Contact} with `ethAddress` being correct hex address`.
 * @returns {null} if ENS name resultion fails or `ethAddress` is neither valid address nor valid ENS name.
 */
export const resolveContact = async (contact: ?Contact, options?: ResolveContactOptions): Promise<?Contact> => {
  if (!contact) return null;

  const showNotificationOption = options?.showNotification ?? true;

  if (isValidAddress(contact.ethAddress)) {
    return contact;
  }

  if (isEnsName(contact.ethAddress)) {
    const resolvedAddress = await resolveEnsName(contact.ethAddress).catch((error) => {
      reportLog('getReceiverWithEnsName failed', { error });
      return null;
    });

    if (!resolvedAddress && showNotificationOption) {
      Toast.show({
        message: t('toast.ensNameNotFound'),
        emoji: 'woman-shrugging',
      });
    }

    return resolvedAddress ? { ...contact, ethAddress: resolvedAddress, ensName: contact.ethAddress } : null;
  }

  return null;
};

export const getReceiverWithEnsName = async (
  ethAddressOrEnsName: ?string,
  showNotification: boolean = true,
): Promise<?{ receiverEnsName?: string, receiver: ?string}> => {
  if (!ethAddressOrEnsName) return null;

  if (isEnsName(ethAddressOrEnsName)) {
    const resolved = await etherspot.getENSNode(ethAddressOrEnsName).catch((error) => {
      reportLog('getReceiverWithEnsName failed', { error });
      return null;
    });

    if (!resolved?.address && showNotification) {
      Toast.show({
        message: t('toast.ensNameNotFound'),
        emoji: 'woman-shrugging',
      });
      return null;
    }

    return {
      receiverEnsName: ethAddressOrEnsName,
      receiver: resolved.address,
    };
  }

  return { receiver: ethAddressOrEnsName };
};

export const getContactWithEnsName = async (contact: Contact, ensName: string): Promise<Contact> => {
  const resolved = await getReceiverWithEnsName(ensName);

  return {
    ...contact,
    name: contact?.name || resolved?.receiverEnsName || '',
    ensName: resolved?.receiverEnsName,
    ethAddress: resolved?.receiver || contact?.ethAddress,
  };
};
