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
import { Linking } from 'react-native';
import ExchangeService from 'services/exchange';
import Toast from 'components/Toast';
import {
  RESET_OFFERS,
  ADD_OFFER,
  SET_EXCHANGE_SEARCH_REQUEST,
  SET_EXECUTING_TRANSACTION,
  SET_DISMISS_TRANSACTION,
  ADD_EXCHANGE_ALLOWANCE,
  UPDATE_EXCHANGE_ALLOWANCE,
  ADD_CONNECTED_EXCHANGE_PROVIDER,
  REMOVE_CONNECTED_EXCHANGE_PROVIDER,
  PROVIDER_SHAPESHIFT,
  MARK_NOTIFICATION_SEEN,
} from 'constants/exchangeConstants';
import { TX_CONFIRMED_STATUS } from 'constants/historyConstants';

import { calculateGasEstimate } from 'services/assets';
import { getActiveAccountAddress } from 'utils/accounts';

import type { Offer, OfferOrder } from 'models/Offer';

import { saveDbAction } from './dbActions';

const exchangeService = new ExchangeService();

const connectExchangeService = (state: Object) => {
  const {
    oAuthTokens: { data: oAuthTokens },
    exchange: { data: { connectedProviders } },
  } = state;
  const { extra: shapeshiftAccessToken } = connectedProviders
    .find(({ id: providerId }) => providerId === PROVIDER_SHAPESHIFT) || {};
  // proceed with new instance only if one is not running and access token changed
  if (exchangeService.connected()) {
    const {
      accessToken: existingAccessToken,
      shapeshiftAccessToken: existingShapeshiftToken,
    } = exchangeService.tokens || {};
    if (existingAccessToken === oAuthTokens.accessToken
      && existingShapeshiftToken === shapeshiftAccessToken) return;
  }
  exchangeService.connect(oAuthTokens.accessToken, shapeshiftAccessToken);
};

export const takeOfferAction = (
  fromAssetCode: string,
  toAssetCode: string,
  fromAmount: number,
  provider: string,
  callback: Function,
) => {
  return async (dispatch: Function, getState: Function) => {
    connectExchangeService(getState());
    const offerRequest = {
      quantity: parseFloat(fromAmount),
      provider,
      fromAssetCode,
      toAssetCode,
    };
    const order = await exchangeService.takeOffer(offerRequest);
    if (!order || !order.data || order.error) {
      let { message = 'Unable to request offer' } = order.error || {};
      if (message.toString().toLowerCase().includes('kyc')) {
        message = 'Shapeshift KYC must be complete in order to proceed';
      }
      Toast.show({
        title: 'Exchange service failed',
        type: 'warning',
        message,
      });
      callback({}); // let's return callback to dismiss loading spinner on offer card button
      return;
    }
    const { data: offerOrderData } = order;
    const {
      payToAddress,
      payAmount,
      transactionObj: {
        data: transactionObjData,
      } = {},
    }: OfferOrder = offerOrderData;
    const {
      accounts: { data: accounts },
      assets: { supportedAssets },
    } = getState();
    const asset = supportedAssets.find(a => a.symbol === fromAssetCode);
    const from = getActiveAccountAddress(accounts);
    const gasLimit = await calculateGasEstimate({
      from,
      to: payToAddress,
      data: transactionObjData,
      amount: payAmount,
      symbol: fromAssetCode,
      contractAddress: asset ? asset.address : '',
      decimals: asset ? asset.decimals : 18,
    });
    callback({
      ...offerOrderData,
      gasLimit,
    });
  };
};

export const resetOffersAction = () => {
  return async (dispatch: Function) => {
    // reset websocket listener
    exchangeService.resetOnOffers();
    dispatch({ type: RESET_OFFERS });
  };
};

export const searchOffersAction = (fromAssetCode: string, toAssetCode: string, fromAmount: number) => {
  return async (dispatch: Function, getState: Function, api: Object) => {
    const {
      user: { data: { walletId: userWalletId } },
      featureFlags: { data: { EXCHANGE_WITH_FIAT_ENABLED: exchangeWithFiatEnabled } },
    } = getState();
    // let's put values to reducer in order to see the previous offers and search values after app gets locked
    dispatch({
      type: SET_EXCHANGE_SEARCH_REQUEST,
      payload: {
        fromAssetCode,
        toAssetCode,
        fromAmount,
      },
    });
    connectExchangeService(getState());
    exchangeService.onOffers(offers =>
      offers
        .filter(({ askRate }) => !!askRate)
        .map((offer: Offer) => dispatch({ type: ADD_OFFER, payload: offer })),
    );
    // we're requesting although it will start delivering when connection is established
    const { error } = await exchangeService.requestOffers(fromAssetCode, toAssetCode, fromAmount);

    if (exchangeWithFiatEnabled) {
      const { isAllowed = false, alpha2 = '' } = await exchangeService.getIPInformation();
      if (isAllowed) {
        api.fetchMoonPayOffers(fromAssetCode, toAssetCode, fromAmount).then((offer) => {
          if (!offer.error) {
            dispatch({
              type: ADD_OFFER,
              payload: {
                ...offer,
                offerRestricted: (!isAllowed && `Unavailable in ${alpha2}`) || null,
              },
            });
          }
        }).catch(() => null);
      }
      if (alpha2 === 'US') {
        api.fetchSendWyreOffers(fromAssetCode, toAssetCode, fromAmount).then((offer) => {
          if (!offer.error) {
            dispatch({
              type: ADD_OFFER,
              payload: {
                ...offer,
                offerRestricted: (alpha2 !== 'US' && `Unavailable in ${alpha2}`) || null,
              },
            });
          }
        }).catch(() => null);
      }
    }

    if (error) {
      const message = error.message || 'Unable to connect';
      if (message.toString().toLowerCase().startsWith('access token')) {
        /**
         * access token is expired or malformed,
         * let's hit with user info endpoint to update access tokens
         * or redirect to pin screen (logic being sdk init)
         * after it's complete (access token's updated) let's dispatch same action again
         * TODO: change SDK user info endpoint to simple SDK token refresh method when it is reachable within SDK
         */
        await api.userInfo(userWalletId).catch(() => null);
      } else {
        Toast.show({
          title: 'Exchange service failed',
          type: 'warning',
          message,
        });
      }
    }
  };
};

export const authorizeWithShapeshiftAction = () => {
  return (dispatch: Function, getState: Function) => {
    connectExchangeService(getState());
    const shapeshiftAuthUrl = exchangeService.getShapeshiftAuthUrl();
    return Linking.canOpenURL(shapeshiftAuthUrl)
      .then((supported) => {
        if (supported) Linking.openURL(shapeshiftAuthUrl);
      })
      .catch(() => {
        Toast.show({
          title: 'Shapeshift authorize failed',
          type: 'warning',
          message: 'Cannot get authorize url',
        });
      });
  };
};

export const addConnectedExchangeProviderAction = (providerId: string, extra?: any) => {
  return (dispatch: Function, getState: Function) => {
    const { exchange: { data: { connectedProviders } } } = getState();
    const provider = {
      id: providerId,
      dateConnected: +new Date(),
      extra,
    };
    const updatedProviders = [
      ...connectedProviders,
      provider,
    ];
    dispatch({
      type: ADD_CONNECTED_EXCHANGE_PROVIDER,
      payload: provider,
    });
    Toast.show({
      title: 'Success',
      type: 'success',
      message: 'You have connected ShapeShift',
    });
    dispatch(saveDbAction('exchangeProviders', {
      connectedProviders: updatedProviders,
    }, true));
  };
};

export const disconnectExchangeProviderAction = (id: string) => {
  return (dispatch: Function, getState: Function) => {
    const { exchange: { data: { connectedProviders } } } = getState();
    const updatedProviders = connectedProviders.filter(({ id: providerId }) => providerId !== id);
    dispatch({
      type: REMOVE_CONNECTED_EXCHANGE_PROVIDER,
      payload: id,
    });
    Toast.show({
      title: 'Success',
      type: 'success',
      message: 'You have disconnected ShapeShift',
    });
    dispatch(saveDbAction('exchangeProviders', {
      connectedProviders: updatedProviders,
    }, true));
  };
};

export const requestShapeshiftAccessTokenAction = (tokenHash: string) => {
  return async (dispatch: Function, getState: Function) => {
    connectExchangeService(getState());
    const { token: shapeshiftAccessToken, error } = await exchangeService.getShapeshiftAccessToken(tokenHash) || {};
    if (error || !shapeshiftAccessToken) {
      Toast.show({
        title: 'Shapeshift authorize failed',
        type: 'warning',
        message: 'Cannot get Shapeshift access token',
      });
      return;
    }
    dispatch(addConnectedExchangeProviderAction(PROVIDER_SHAPESHIFT, shapeshiftAccessToken));
  };
};

export const setExecutingTransactionAction = () => ({
  type: SET_EXECUTING_TRANSACTION,
});

export const setDismissTransactionAction = () => ({
  type: SET_DISMISS_TRANSACTION,
});

export const setTokenAllowanceAction = (
  assetCode: string,
  provider: string,
  callback: Function,
) => {
  return async (dispatch: Function, getState: Function) => {
    connectExchangeService(getState());
    const allowanceRequest = {
      provider,
      token: assetCode,
    };
    const response = await exchangeService.setTokenAllowance(allowanceRequest);
    if (!response || !response.data || response.error) {
      Toast.show({
        title: 'Exchange service failed',
        type: 'warning',
        message: 'Unable to set token allowance',
      });
      callback({}); // let's return callback to dismiss loading spinner on offer card button
      return;
    }
    const { data: { to: payToAddress, data } } = response;
    const {
      accounts: { data: accounts },
      assets: { supportedAssets },
    } = getState();
    const asset = supportedAssets.find(a => a.symbol === assetCode);
    const from = getActiveAccountAddress(accounts);
    const gasLimit = await calculateGasEstimate({
      from,
      to: payToAddress,
      data,
      symbol: assetCode,
      contractAddress: asset ? asset.address : '',
      decimals: asset ? asset.decimals : 18,
    });
    callback({
      data,
      payToAddress,
      transactionObj: {
        data,
      },
      gasLimit,
    });
  };
};

export const addExchangeAllowanceAction = (
  provider: string,
  assetCode: string,
  transactionHash: string,
) => {
  return async (dispatch: Function, getState: Function) => {
    const { exchange: { data: { allowances: _allowances = [] } } } = getState();
    const allowance = {
      provider,
      assetCode,
      transactionHash,
      enabled: false,
    };

    // filter pending for current provider and asset match to override failed transactions
    const allowances = _allowances
      .filter(({ provider: _provider, assetCode: _assetCode }) =>
        assetCode !== _assetCode && provider !== _provider,
      );

    allowances.push(allowance);

    dispatch({
      type: ADD_EXCHANGE_ALLOWANCE,
      payload: allowance,
    });
    dispatch(saveDbAction('exchangeAllowances', { allowances }, true));
  };
};

export const enableExchangeAllowanceByHashAction = (transactionHash: string) => {
  return async (dispatch: Function, getState: Function) => {
    const { exchange: { data: { allowances: _allowances = [] } } } = getState();
    const allowance = _allowances.find(
      ({ transactionHash: _transactionHash }) => _transactionHash === transactionHash,
    );
    if (!allowance) return;
    const updatedAllowance = {
      ...allowance,
      enabled: true,
    };
    dispatch({
      type: UPDATE_EXCHANGE_ALLOWANCE,
      payload: updatedAllowance,
    });
    const allowances = _allowances
      .filter(
        ({ transactionHash: _transactionHash }) => _transactionHash !== transactionHash,
      );
    allowances.push(updatedAllowance);
    dispatch(saveDbAction('exchangeAllowances', { allowances }, true));
  };
};

export const checkEnableExchangeAllowanceTransactionsAction = () => {
  return async (dispatch: Function, getState: Function) => {
    const {
      history: {
        data: transactionsHistory,
      },
      exchange: {
        data: {
          allowances: exchangeAllowances,
        },
      },
    } = getState();
    const accountIds = Object.keys(transactionsHistory);
    const allHistory = accountIds.reduce(
      // $FlowFixMe
      (existing = [], accountId) => {
        const walletAssetsHistory = transactionsHistory[accountId] || [];
        return [...existing, ...walletAssetsHistory];
      },
      [],
    );
    exchangeAllowances
      .filter(({ enabled }) => !enabled)
      .map(({ transactionHash, assetCode }) => {  // eslint-disable-line
        const enabledAllowance = allHistory.find(
          ({ hash, status }) => hash === transactionHash && status === TX_CONFIRMED_STATUS,
        );
        if (enabledAllowance) {
          Toast.show({
            message: `${assetCode} token exchange was enabled`,
            type: 'success',
            title: 'Success',
            autoClose: true,
          });
          dispatch(enableExchangeAllowanceByHashAction(transactionHash));
        }
      });
  };
};

export const markNotificationAsSeenAction = () => {
  return async (dispatch: Function) => {
    dispatch({
      type: MARK_NOTIFICATION_SEEN,
    });
  };
};
