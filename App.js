// @flow
import * as React from 'react';
import { addNavigationHelpers } from 'react-navigation';
import { Provider, connect } from 'react-redux';
import { createReduxBoundAddListener } from 'react-navigation-redux-helpers';
import RootNavigation from 'navigation/rootNavigation';
import { SHOW_STORYBOOK } from 'react-native-dotenv';
import configureStore from './src/configureStore';
import StorybookUI from './storybook';

const store = configureStore();
const addListener = createReduxBoundAddListener('root');

const App = ({ dispatch, navigation }) => (
  <RootNavigation
    navigation={addNavigationHelpers({
      dispatch,
      state: navigation,
      addListener,
    })}
  />
);

const mapStateToProps = ({ navigation }) => ({
  navigation,
});

const AppWithNavigationState = connect(mapStateToProps)(App);

const Root = () => (
  <Provider store={store}>
    <AppWithNavigationState />
  </Provider>
);

export default (__DEV__ && SHOW_STORYBOOK === 'true') ? StorybookUI : Root;
