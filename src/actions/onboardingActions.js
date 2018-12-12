// @flow
import ethers from 'ethers';
import { NavigationActions } from 'react-navigation';
import firebase from 'react-native-firebase';
import { delay, uniqBy } from 'utils/common';
import Intercom from 'react-native-intercom';
import { ImageCacheManager } from 'react-native-cached-image';
import ChatService from 'services/chat';
import { generateMnemonicPhrase, getSaltedPin } from 'utils/wallet';
import {
  ENCRYPTING,
  GENERATE_ENCRYPTED_WALLET,
  GENERATING,
  UPDATE_WALLET_STATE,
  REGISTERING,
  USERNAME_EXISTS,
  USERNAME_OK,
  CHECKING_USERNAME,
  SET_API_USER,
} from 'constants/walletConstants';
import { APP_FLOW, NEW_WALLET, ASSETS } from 'constants/navigationConstants';
import { SET_INITIAL_ASSETS, UPDATE_ASSETS } from 'constants/assetsConstants';
import { UPDATE_CONTACTS } from 'constants/contactsConstants';
import {
  TYPE_ACCEPTED,
  TYPE_RECEIVED,
  UPDATE_INVITATIONS,
} from 'constants/invitationsConstants';
import { UPDATE_APP_SETTINGS } from 'constants/appSettingsConstants';
import { UPDATE_RATES } from 'constants/ratesConstants';
import { PENDING, REGISTERED, UPDATE_USER } from 'constants/userConstants';
import { UPDATE_ACCESS_TOKENS } from 'constants/accessTokensConstants';
import { SET_HISTORY } from 'constants/historyConstants';
import { generateChatPassword } from 'utils/chat';
import Storage from 'services/storage';
import { navigate } from 'services/navigation';
import { getExchangeRates } from 'services/assets';
import { saveDbAction } from './dbActions';
import { generateWalletMnemonicAction } from './walletActions';

const storage = Storage.getInstance('db');
const chat = new ChatService();

const getTokenWalletAndRegister = async (api: Object, user: Object, dispatch: Function) => {
  await firebase.messaging().requestPermission().catch(() => { });
  const fcmToken = await firebase.messaging().getToken().catch(() => { });

  await Intercom.sendTokenToIntercom(fcmToken).catch(() => null);
  const sdkWallet = await api.registerOnAuthServer(fcmToken, user.username);
  const registrationSucceed = !sdkWallet.error;
  const userInfo = await api.userInfo(sdkWallet.walletId);
  const userState = Object.keys(userInfo).length ? REGISTERED : PENDING;

  if (Object.keys(userInfo).length) {
    dispatch(saveDbAction('user', { user: userInfo }, true));
  }

  dispatch({
    type: UPDATE_USER,
    payload: {
      user: userInfo,
      state: userState,
    },
  });

  if (!registrationSucceed) {
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: sdkWallet.reason,
    });
  }

  // invalidate image cache
  ImageCacheManager().clearCache().catch(() => null);

  return {
    sdkWallet,
    userInfo,
    userState,
    fcmToken,
    registrationSucceed,
  };
};

const finishRegistration = async (api: Object, userInfo: Object, dispatch: Function) => {
  // get & store initial assets
  const initialAssets = await api.fetchInitialAssets(userInfo.walletId);
  const rates = await getExchangeRates(Object.keys(initialAssets));

  dispatch({
    type: UPDATE_RATES,
    payload: rates,
  });

  dispatch({
    type: SET_INITIAL_ASSETS,
    payload: initialAssets,
  });

  dispatch(saveDbAction('assets', { assets: initialAssets }));

  // restore access tokens
  dispatch(restoreAccessTokensAction(userInfo.walletId)); // eslint-disable-line
};

const navigateToAppFlow = () => {
  const navigateToAssetsAction = NavigationActions.navigate({
    routeName: APP_FLOW,
    params: {},
    action: NavigationActions.navigate({ routeName: ASSETS }),
  });

  navigate(navigateToAssetsAction);
};

export const registerWalletAction = () => {
  return async (dispatch: Function, getState: () => any, api: Object) => {
    const currentState = getState();
    const {
      mnemonic,
      pin,
      importedWallet,
      apiUser,
    } = currentState.wallet.onboarding;

    const mnemonicPhrase = mnemonic.original;
    const { isBackedUp } = currentState.wallet.backupStatus;

    // STEP 0: Clear local storage
    await storage.removeAll();
    dispatch({ type: UPDATE_CONTACTS, payload: [] });
    dispatch({ type: UPDATE_INVITATIONS, payload: [] });
    dispatch({ type: UPDATE_ASSETS, payload: {} });
    dispatch({ type: UPDATE_APP_SETTINGS, payload: {} });
    dispatch({ type: UPDATE_ACCESS_TOKENS, payload: [] });
    dispatch({ type: SET_HISTORY, payload: [] });

    // STEP 1: navigate to the new wallet screen
    navigate(NavigationActions.navigate({ routeName: NEW_WALLET }));
    await delay(50);

    // STEP 2: check if wallet was imported or create it from the mnemonic phrase otherwise
    let wallet = importedWallet;
    if (!wallet) {
      dispatch({
        type: UPDATE_WALLET_STATE,
        payload: GENERATING,
      });
      await delay(50);
      wallet = ethers.Wallet.fromMnemonic(mnemonicPhrase);
    }

    // STEP 3: encrypt the wallet
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: ENCRYPTING,
    });
    await delay(50);
    const saltedPin = getSaltedPin(pin);
    const encryptedWallet = await wallet.RNencrypt(saltedPin, { scrypt: { N: 16384 } })
      .then(JSON.parse)
      .catch(() => ({}));

    dispatch(saveDbAction('wallet', {
      wallet: {
        ...encryptedWallet,
        backupStatus: { isImported: !!importedWallet, isBackedUp },
      },
    }));
    dispatch(saveDbAction('app_settings', { appSettings: { wallet: +new Date() } }));
    const user = apiUser.username ? { username: apiUser.username } : {};
    dispatch(saveDbAction('user', { user }));
    dispatch({
      type: GENERATE_ENCRYPTED_WALLET,
      payload: {
        address: wallet.address,
      },
    });

    // STEP 4: Initialize SDK annd register user
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: REGISTERING,
    });

    api.init(wallet.privateKey);
    const {
      sdkWallet,
      userInfo,
      fcmToken,
      registrationSucceed,
    } = await getTokenWalletAndRegister(api, user, dispatch);

    await chat.init({
      userId: sdkWallet.userId,
      username: user.username,
      password: generateChatPassword(wallet.privateKey),
      walletId: sdkWallet.walletId,
      ethAddress: wallet.address,
    }).catch(() => null);
    await chat.client.registerAccount().catch(() => null);
    await chat.client.setFcmId(fcmToken).catch(() => null);

    if (!registrationSucceed) { return; }

    // STEP 5: finish registration
    await finishRegistration(api, userInfo, dispatch);

    // STEP 6: all done, navigate to the assets screen
    navigateToAppFlow();
  };
};

export const registerOnBackendAction = () => {
  return async (dispatch: Function, getState: () => Object, api: Object) => {
    const { wallet: { onboarding: { apiUser } } } = getState();
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: REGISTERING,
    });
    let { user } = await storage.get('user');
    if (apiUser.username) {
      user = apiUser;
    }
    await delay(1000);

    const { registrationSucceed, userInfo } = await getTokenWalletAndRegister(api, user, dispatch);
    if (!registrationSucceed) { return; }

    await finishRegistration(api, userInfo, dispatch);
    navigateToAppFlow();
  };
};

export const validateUserDetailsAction = ({ username }: Object) => {
  return async (dispatch: Function, getState: () => Object, api: Object) => {
    const currentState = getState();
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: CHECKING_USERNAME,
    });
    const { mnemonic, importedWallet } = currentState.wallet.onboarding;
    const mnemonicPhrase = generateMnemonicPhrase(mnemonic.original);
    dispatch(generateWalletMnemonicAction(mnemonicPhrase));
    await delay(200);

    let wallet = importedWallet;
    if (!wallet) {
      wallet = currentState.wallet.data.privateKey
        ? currentState.wallet.data
        : ethers.Wallet.fromMnemonic(mnemonicPhrase);
    }

    api.init(wallet.privateKey);
    const apiUser = await api.usernameSearch(username);
    const usernameExists = !!Object.keys(apiUser).length;
    const usernameStatus = usernameExists ? USERNAME_EXISTS : USERNAME_OK;
    dispatch({
      type: SET_API_USER,
      payload: usernameExists ? apiUser : { username },
    });
    dispatch({
      type: UPDATE_WALLET_STATE,
      payload: usernameStatus,
    });
  };
};

function restoreAccessTokensAction(walletId: string) {
  return async (dispatch: Function, getState: () => Object, api: Object) => {
    const restoredAccessTokens = [];
    const userAccessTokens = await api.fetchAccessTokens(walletId);

    // get connectionRequestedEvent & connectionAcceptedEvent notifications
    const types = [
      TYPE_RECEIVED,
      TYPE_ACCEPTED,
    ];
    const rawNotifications = await api.fetchNotifications(walletId, types.join(' '));
    if (!rawNotifications.length) return;

    const notifications = rawNotifications
      .map(({ payload: { msg }, createdAt }) => ({ ...JSON.parse(msg), createdAt }))
      .map(({ senderUserData, type, createdAt }) => ({ ...senderUserData, type, createdAt }))
      .sort((a, b) => b.createdAt - a.createdAt);

    // split into groups
    let receivedConnectionRequests = notifications.filter(notification => notification.type === TYPE_RECEIVED);
    let sentConnectionRequests = notifications.filter(notification => notification.type === TYPE_ACCEPTED);

    // remove duplicates
    receivedConnectionRequests = uniqBy(receivedConnectionRequests, 'id');
    sentConnectionRequests = uniqBy(sentConnectionRequests, 'id');

    userAccessTokens.forEach(token => {
      // check in received connection requests
      let found = receivedConnectionRequests.find(({ id }) => id === token.contactId);

      // not found? check in sent connection requests
      if (!found) {
        found = sentConnectionRequests.find(({ id }) => id === token.contactId);
      }

      // can't find again? then skip this connection
      if (!found) return;

      restoredAccessTokens.push({
        myAccessToken: token.accessKey,
        userId: token.contactId,
        userAccessToken: found.connectionKey,
      });
    });
    dispatch({
      type: UPDATE_ACCESS_TOKENS,
      payload: restoredAccessTokens,
    });
    dispatch(saveDbAction('accessTokens', { accessTokens: restoredAccessTokens }, true));
  };
}
