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
import { FlatList } from 'react-native';
import isEqual from 'lodash.isequal';
import type { NavigationScreenProp } from 'react-navigation';
import styled, { withTheme } from 'styled-components/native';
import memoize from 'memoize-one';

// types
import type { Transaction } from 'models/Transaction';
import type { EnsRegistry } from 'reducers/ensRegistryReducer';

// components
import SlideModal from 'components/Modals/SlideModal';
import Title from 'components/Title';
import EventDetails from 'components/EventDetails';
import Tabs from 'components/Tabs';
import { BaseText } from 'components/Typography';
import EmptyStateParagraph from 'components/EmptyState/EmptyStateParagraph';
import ActivityFeedItem from 'components/ActivityFeed/ActivityFeedItem';

// utils
import { groupAndSortByDate } from 'utils/common';
import { fontStyles, spacing } from 'utils/variables';
import { themedColors } from 'utils/themes';

// constants
import {
  TYPE_RECEIVED,
  TYPE_ACCEPTED,
  TYPE_SENT,
} from 'constants/invitationsConstants';
import { COLLECTIBLE_TRANSACTION } from 'constants/collectiblesConstants';
import { TRANSACTION_EVENT } from 'constants/historyConstants';
import { USER_EVENT } from 'constants/userEventsConstants';
import { BADGE_REWARD_EVENT } from 'constants/badgesConstants';


const ActivityFeedList = styled.FlatList`
  width: 100%;
  flex: 1;
`;

const ActivityFeedWrapper = styled.View`
  flex: 1;
`;

const ActivityFeedHeader = styled.View`
  padding: ${spacing.mediumLarge}px ${spacing.large}px 0;
  border-top-width: ${props => props.noBorder ? 0 : '1px'};
  border-top-color: ${themedColors.border};
`;

const SectionHeaderWrapper = styled.View`
  width: 100%;
  padding: ${spacing.small}px ${spacing.large}px;
`;

const SectionHeader = styled(BaseText)`
  ${fontStyles.regular};
  color: ${themedColors.secondaryText};
`;

const EmptyStateWrapper = styled.View`
  padding: 15px 30px 30px;
  width: 100%;
  flex: 1;
  align-items: center;
  justify-content: center;
`;

type EmptyState = {|
  title?: string,
  textBody?: string,
|};

type Tab = {|
  id: string,
  name: string,
  icon?: string,
  onPress: Function,
  unread?: number,
  tabImageNormal?: string,
  tabImageActive?: string,
  data: Object[],
  emptyState?: EmptyState,
|};

type Props = {
  onAcceptInvitation: Function,
  onCancelInvitation: Function,
  onRejectInvitation: Function,
  navigation: NavigationScreenProp<*>,
  feedTitle?: string,
  wrapperStyle?: Object,
  noBorder?: boolean,
  contentContainerStyle?: Object,
  initialNumToRender: number,
  tabs?: Tab[],
  activeTab?: string,
  feedData?: Object[],
  extraFeedData?: Object[],
  hideTabs: boolean,
  emptyState?: EmptyState,
  ensRegistry: EnsRegistry,
  tabsComponent?: React.Node,
  headerComponent?: React.Node,
  flatListProps?: FlatList,
};

type State = {|
  showModal: boolean,
  selectedEventData: ?Object | ?Transaction,
  eventType: string,
  eventStatus: string,
  tabIsChanging: boolean,
  scrollOffset: ?number,
  maxScrollOffset: ?number,
|};

const ITEM_TYPE = {
  HEADER: 'HEADER',
  TABS: 'TABS',
  SECTION: 'SECTION',
  ITEM: 'ITEM',
};

class ActivityFeed extends React.Component<Props, State> {
  eventDetailScrollViewRef: ?Object;

  static defaultProps = {
    initialNumToRender: 7,
  };

  state = {
    showModal: false,
    selectedEventData: null,
    eventType: '',
    eventStatus: '',
    tabIsChanging: false,
    scrollOffset: undefined,
    maxScrollOffset: undefined,
  };

  generateFeedSections = memoize(
    (tabs, activeTab, feedData, headerComponent, tabsComponent) => {
      let feedList = feedData || [];

      if (tabs.length) {
        const activeTabInfo = tabs.find(({ id }) => id === activeTab);
        if (activeTabInfo) ({ data: feedList } = activeTabInfo);
      }

      const filteredFeedList = feedList.filter(this.shouldRenderActivityItem);

      const dataSections = groupAndSortByDate(filteredFeedList);

      const items = [];
      items.push({ type: ITEM_TYPE.HEADER, component: headerComponent });
      items.push({ type: ITEM_TYPE.TABS, component: tabsComponent });
      dataSections.forEach(({ data, ...section }) => {
        items.push({ type: ITEM_TYPE.SECTION, section });
        data.forEach(item => items.push({ type: ITEM_TYPE.ITEM, item }));
      });

      return items;
    },
    isEqual,
  );

  getEmptyStateData = () => {
    const {
      tabs = [],
      activeTab,
      emptyState,
    } = this.props;

    let emptyStateData = emptyState || {};
    if (tabs.length) {
      const activeTabInfo = tabs.find(({ id }) => id === activeTab);
      if (activeTabInfo) ({ emptyState: emptyStateData = {} } = activeTabInfo);
    }
    return emptyStateData;
  }

  shouldComponentUpdate(nextProps: Props, nextState: State) {
    const isEq = isEqual(this.props, nextProps) && isEqual(this.state, nextState);
    return !isEq;
  }

  selectEvent = (eventData: Object, eventType, eventStatus) => {
    this.setState({
      eventType,
      eventStatus,
      selectedEventData: eventData,
      showModal: true,
    });
  };

  shouldRenderActivityItem = (item: Object) => {
    const typesThatRender = [
      USER_EVENT, TRANSACTION_EVENT, COLLECTIBLE_TRANSACTION, BADGE_REWARD_EVENT,
      TYPE_SENT, TYPE_RECEIVED, TYPE_ACCEPTED,
    ];
    return typesThatRender.includes(item.type);
  }

  renderActivityFeedItem = ({ item }) => {
    switch (item.type) {
      case ITEM_TYPE.HEADER:
      case ITEM_TYPE.TABS:
        return item.component;
      case ITEM_TYPE.SECTION:
        return (
          <SectionHeaderWrapper>
            <SectionHeader>{item.section.title}</SectionHeader>
          </SectionHeaderWrapper>
        );
      default:
        const { onRejectInvitation, onAcceptInvitation } = this.props;
        return (
          <ActivityFeedItem
            event={item.item}
            selectEvent={this.selectEvent}
            rejectInvitation={onRejectInvitation}
            acceptInvitation={onAcceptInvitation}
          />
        );
    }
  };

  handleRejectInvitation = () => {
    this.props.onRejectInvitation(this.state.selectedEventData);
  };

  handleCancelInvitation = () => {
    this.props.onCancelInvitation(this.state.selectedEventData);
  };

  handleAcceptInvitation = () => {
    this.props.onAcceptInvitation(this.state.selectedEventData);
  };

  handleClose = () => {
    this.setState({ showModal: false });
  };

  getActivityFeedListKeyExtractor = (item: Object = {}) => {
    switch (item.type) {
      case ITEM_TYPE.HEADER:
      case ITEM_TYPE.TABS:
        return item.type;
      case ITEM_TYPE.SECTION:
        return item.section.title;
      default:
        const { createdAt = '' } = item.item;
        return `${createdAt.toString()}${item.item.id || item.item._id || item.item.hash || ''}`;
    }
  };

  onTabChange = (isChanging?: boolean) => {
    this.setState({ tabIsChanging: isChanging });
  };

  render() {
    const {
      feedTitle,
      navigation,
      wrapperStyle,
      noBorder,
      contentContainerStyle,
      initialNumToRender,
      tabs = [],
      activeTab,
      extraFeedData,
      hideTabs,
      feedData,
      headerComponent,
      tabsComponent,
      flatListProps,
    } = this.props;

    const {
      showModal,
      selectedEventData,
      eventType,
      eventStatus,
      tabIsChanging,
      scrollOffset,
      maxScrollOffset,
    } = this.state;

    const formattedFeedData = this.generateFeedSections(tabs, activeTab, feedData, headerComponent, tabsComponent);

    const emptyStateData = this.getEmptyStateData();

    const firstTab = tabs.length ? tabs[0].id : '';

    const additionalContentContainerStyle = !formattedFeedData.length
      ? { justifyContent: 'center', flex: 1 }
      : {};

    const tabsProps = tabs.map(({ data, emptyState, ...necessaryTabProps }) => necessaryTabProps);

    return (
      <ActivityFeedWrapper style={wrapperStyle}>
        {!!feedTitle &&
        <ActivityFeedHeader noBorder={noBorder}>
          <Title subtitle title={feedTitle} noMargin />
        </ActivityFeedHeader>}
        {tabs.length > 1 && !hideTabs &&
          <Tabs
            tabs={tabsProps}
            wrapperStyle={{ paddingTop: 0 }}
            onTabChange={this.onTabChange}
            activeTab={activeTab || firstTab}
          />
        }
        {!tabIsChanging &&
        <ActivityFeedList
          data={formattedFeedData}
          initialNumToRender={initialNumToRender}
          extraData={extraFeedData}
          renderItem={this.renderActivityFeedItem}
          onEndReachedThreshold={0.5}
          keyExtractor={this.getActivityFeedListKeyExtractor}
          contentContainerStyle={[additionalContentContainerStyle, contentContainerStyle]}
          ListEmptyComponent={(
            <EmptyStateWrapper>
              <EmptyStateParagraph {...emptyStateData} />
            </EmptyStateWrapper>
          )}
          stickyHeaderIndices={[1]}
          {...flatListProps}
        />}
        {!!selectedEventData &&
        <SlideModal
          isVisible={showModal}
          title="transaction details"
          onModalHide={this.handleClose}
          eventDetail
          handleScrollTo={({ y }) => {
            if (this.eventDetailScrollViewRef && y) {
              this.eventDetailScrollViewRef.scrollTo({ x: 0, y, animated: false });
            }
          }}
          scrollOffset={scrollOffset}
          scrollOffsetMax={maxScrollOffset}
          onSwipeComplete={this.handleClose}
        >
          <EventDetails
            eventData={selectedEventData}
            eventType={eventType}
            eventStatus={eventStatus}
            onClose={this.handleClose}
            onReject={this.handleRejectInvitation}
            onCancel={this.handleCancelInvitation}
            onAccept={this.handleAcceptInvitation}
            navigation={navigation}
            getRef={(ref) => { this.eventDetailScrollViewRef = ref; }}
            getScrollOffset={(offset) => this.setState({ scrollOffset: offset })}
            getMaxScrollOffset={(maxOffset) => this.setState({ maxScrollOffset: maxOffset })}
          />
        </SlideModal>
        }
      </ActivityFeedWrapper>
    );
  }
}

export default withTheme(ActivityFeed);
