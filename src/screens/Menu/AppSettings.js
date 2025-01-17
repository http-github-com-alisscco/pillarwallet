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

import * as React from 'react';
import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';
import t from 'translations/translate';

// actions
import {
  setAppThemeAction,
  setPreferredGasTokenAction,
} from 'actions/appSettingsActions';
import { getLanguageFullName } from 'services/localisation/translations';

// components
import ContainerWithHeader from 'components/Layout/ContainerWithHeader';
import { ScrollWrapper } from 'components/Layout';
import Modal from 'components/Modal';

// constants
import { defaultFiatCurrency, ETH, PLR } from 'constants/assetsConstants';
import { DARK_THEME, LIGHT_THEME } from 'constants/appSettingsConstants';
import { REMOTE_CONFIG } from 'constants/remoteConfigConstants';

// utils
import { spacing } from 'utils/variables';
import SystemInfoModal from 'components/SystemInfoModal';
import RelayerMigrationModal from 'components/RelayerMigrationModal';
import localeConfig from 'configs/localeConfig';
import { isArchanovaAccount } from 'utils/accounts';

// selectors
import { isGasTokenSupportedSelector, preferredGasTokenSelector } from 'selectors/archanova';
import { accountEthereumAssetsSelector } from 'selectors/assets';
import { accountHistorySelector } from 'selectors/history';
import { activeAccountSelector } from 'selectors';

// services
import { firebaseRemoteConfig } from 'services/firebase';

// types
import type { Dispatch, RootReducerState } from 'reducers/rootReducer';
import type { Transaction } from 'models/Transaction';
import type { AssetsBySymbol } from 'models/Asset';
import type { LocalisationOptions } from 'models/Translations';
import type { NavigationScreenProp } from 'react-navigation';
import type { Account } from 'models/Account';
import type { ChainRecord } from 'models/Chain';

// local
import { SettingsSection } from './SettingsSection';
import BaseFiatCurrencyModal from './BaseFiatCurrencyModal';
import LanguageModal from './LanguageModal';
import AnalyticsModal from './AnalyticsModal';

type Props = {
  baseFiatCurrency: ?string,
  themeType: string,
  setAppTheme: (themeType: string, isManualThemeSelection?: boolean) => void,
  preferredGasToken: ?string,
  isGasTokenSupported: boolean,
  accountAssets: AssetsBySymbol,
  accountHistory: ChainRecord<Transaction[]>,
  setPreferredGasToken: (token: string) => void,
  localisation: ?LocalisationOptions,
  navigation: NavigationScreenProp<*>,
  activeDeviceAddress: string,
  sessionLanguageCode: ?string,
  activeAccount: ?Account,
};

type State = {
  isAfterRelayerMigration: boolean,
};

class AppSettings extends React.Component<Props, State> {
  state = {
    isAfterRelayerMigration: false,
  };

  getItems = () => {
    const {
      baseFiatCurrency,
      themeType,
      setAppTheme,
      preferredGasToken,
      isGasTokenSupported,
      setPreferredGasToken,
      localisation,
      sessionLanguageCode,
      activeAccount,
    } = this.props;

    const isArchanovaAccountActive = isArchanovaAccount(activeAccount);

    const showRelayerMigration = isArchanovaAccountActive && !isGasTokenSupported;

    const showGasTokenOption = isArchanovaAccountActive
      && firebaseRemoteConfig.getBoolean(REMOTE_CONFIG.APP_FEES_PAID_WITH_PLR);

    return [
      {
        key: 'language',
        title: t('settingsContent.settingsItem.language.title'),
        onPress: this.openLanguageModal,
        value: getLanguageFullName(localisation?.activeLngCode || sessionLanguageCode || localeConfig.defaultLanguage),
        hidden: !localeConfig.isEnabled && Object.keys(localeConfig.supportedLanguages).length <= 1,
      },
      {
        key: 'localFiatCurrency',
        title: t('settingsContent.settingsItem.fiatCurrency.title'),
        onPress: this.openBaseFiatCurrencyModal,
        value: baseFiatCurrency || defaultFiatCurrency,
      },
      showGasTokenOption && {
        key: 'preferredGasToken',
        title: t('settingsContent.settingsItem.payFeeWithPillar.title'),
        toggle: true,
        value: preferredGasToken === PLR,
        onPress: () => {
          if (showRelayerMigration) {
            this.openRelayerMigrationModal();
            return;
          }
          setPreferredGasToken(preferredGasToken === PLR ? ETH : PLR);
        },
      },
      {
        key: 'darkMode',
        title: t('settingsContent.settingsItem.darkMode.title'),
        toggle: true,
        value: themeType === DARK_THEME,
        onPress: () => setAppTheme(themeType === DARK_THEME ? LIGHT_THEME : DARK_THEME, true),
      },
      {
        key: 'analytics',
        title: t('settingsContent.settingsItem.analytics.title'),
        onPress: this.openAnalyticsModal,
      },
      {
        key: 'systemInfo',
        title: t('settingsContent.settingsItem.systemInfo.title'),
        onPress: this.openSystemInfoModal,
      },
    ].filter(Boolean);
  };

  openBaseFiatCurrencyModal = () => Modal.open(() => <BaseFiatCurrencyModal />)

  openLanguageModal = () => Modal.open(() => <LanguageModal />)

  openRelayerMigrationModal = () => {
    const { accountAssets, accountHistory } = this.props;

    Modal.open(() => (
      <RelayerMigrationModal
        accountAssets={accountAssets}
        accountHistory={accountHistory}
        onMigrated={() => this.setState({ isAfterRelayerMigration: true })}
      />
    ));
  }

  openAnalyticsModal = () => Modal.open(() => <AnalyticsModal />)

  openSystemInfoModal = () => Modal.open(() => <SystemInfoModal />);

  componentDidUpdate(prevProps: Props) {
    const { isGasTokenSupported, setPreferredGasToken, preferredGasToken } = this.props;
    const gasTokenBecameSupported = prevProps.isGasTokenSupported !== isGasTokenSupported && isGasTokenSupported;

    if (gasTokenBecameSupported && this.state.isAfterRelayerMigration) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ isAfterRelayerMigration: false });
      setPreferredGasToken(preferredGasToken === PLR ? ETH : PLR);
    }
  }

  render() {
    return (
      <ContainerWithHeader
        headerProps={{ centerItems: [{ title: t('settingsContent.settingsItem.appSettings.title') }] }}
        inset={{ bottom: 'never' }}
      >
        <ScrollWrapper
          contentContainerStyle={{
            paddingTop: spacing.mediumLarge,
          }}
        >
          <SettingsSection
            sectionItems={this.getItems()}
          />
        </ScrollWrapper>
      </ContainerWithHeader>
    );
  }
}

const mapStateToProps = ({
  appSettings: {
    data: {
      baseFiatCurrency,
      themeType,
      localisation,
    },
  },
  smartWallet: { connectedAccount: { activeDeviceAddress } },
  session: { data: { sessionLanguageCode } },
}: RootReducerState): $Shape<Props> => ({
  baseFiatCurrency,
  themeType,
  localisation,
  activeDeviceAddress,
  sessionLanguageCode,
});

const structuredSelector = createStructuredSelector({
  isGasTokenSupported: isGasTokenSupportedSelector,
  accountAssets: accountEthereumAssetsSelector,
  accountHistory: accountHistorySelector,
  preferredGasToken: preferredGasTokenSelector,
  activeAccount: activeAccountSelector,
});

const combinedMapStateToProps = (state) => ({
  ...structuredSelector(state),
  ...mapStateToProps(state),
});

const mapDispatchToProps = (dispatch: Dispatch): $Shape<Props> => ({
  setAppTheme: (themeType: string, isManualThemeSelection?: boolean) => dispatch(
    setAppThemeAction(themeType, isManualThemeSelection),
  ),
  setPreferredGasToken: (token: string) => dispatch(setPreferredGasTokenAction(token)),
});

export default connect(combinedMapStateToProps, mapDispatchToProps)(AppSettings);
