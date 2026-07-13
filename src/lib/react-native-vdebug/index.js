/// 魔改自 https://github.com/itenl/react-native-vdebug
import PropTypes from 'prop-types';
import React, {PureComponent} from 'react';
import {
    BackHandler,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    NativeModules,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Alert,
} from 'react-native';
import {
    GestureHandlerRootView,
    ScrollView,
} from 'react-native-gesture-handler';
import Clipboard from '@react-native-clipboard/clipboard';
import RNFS from 'react-native-fs';
import event from './src/event';
import Log, {traceLog, getLogStack} from './src/log';
import HocComp from './src/hoc';
import Storage from './src/storage';
import {replaceReg} from './src/tool';
import DebugFab from './DebugFab';
import DebugFloat from '@/native/debugFloat';

const win = Dimensions.get('window');
const SCREEN_W = win.width;
const SCREEN_H = win.height;
const useNativeFab = DebugFloat.isSupported;

let commandContext = global;

export const setExternalContext = externalContext => {
    if (externalContext) commandContext = externalContext;
};

export const initTrace = () => {
    traceLog();
};

/**
 * Final architecture (read before changing):
 *
 * 1) Android FAB = native PopupWindow
 *    - Outside RN Yoga → never reflows music bar
 *    - Always on top of app content, draggable via PopupWindow.update
 *    - No Dialog remove/add → no EGL_BAD_ACCESS
 *
 * 2) Log panel = absolute overlay with FIXED pixel size (not flex sibling)
 *    - Host is position:absolute; width/height = screen px (not %)
 *    - Mounted INSIDE the app's flex:1 wrapper as an overlay child
 *    - pointerEvents box-none when closed (host empty)
 *
 * 3) Never use RN Modal for the panel while also needing a free FAB above it
 *    (Modal is another window and covers PopupWindow / decor FAB).
 */
class VDebug extends PureComponent {
    static propTypes = {
        panels: PropTypes.array,
    };

    static defaultProps = {
        panels: null,
    };

    constructor(props) {
        super(props);
        initTrace();
        this.containerHeight = Math.floor((SCREEN_H / 3) * 2);
        this.refsObj = {};
        this.state = {
            commandValue: '',
            panelOpen: false,
            currentPageIndex: 0,
            panels: this.addPanels(),
            history: [],
            historyFilter: [],
            showHistory: false,
            fabLeft: Math.max(0, SCREEN_W - 72),
            fabTop: Math.floor(SCREEN_H / 2),
        };
    }

    componentDidMount() {
        Storage.support() &&
            Storage.get('react-native-vdebug@history').then(res => {
                if (res) {
                    this.setState({history: res});
                }
            });

        if (useNativeFab) {
            this._removeNativePress = DebugFloat.addPressListener(() => {
                this.togglePanel();
            });
            DebugFloat.getPosition().then(pos => {
                if (pos) {
                    this.setState({fabLeft: pos.x, fabTop: pos.y});
                }
            });
            DebugFloat.show();
            this._showRetryTimers = [200, 800, 2000].map(ms =>
                setTimeout(() => DebugFloat.show(), ms),
            );
        }

        this._backSub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (this.state.panelOpen) {
                this.closePanel();
                return true;
            }
            return false;
        });
    }

    componentWillUnmount() {
        if (this._removeNativePress) {
            this._removeNativePress();
            this._removeNativePress = null;
        }
        if (this._backSub) {
            this._backSub.remove();
            this._backSub = null;
        }
        if (this._showRetryTimers) {
            this._showRetryTimers.forEach(clearTimeout);
            this._showRetryTimers = null;
        }
        if (useNativeFab) {
            DebugFloat.hide();
        }
    }

    componentDidUpdate(_prevProps, prevState) {
        if (!useNativeFab) return;
        if (prevState.panelOpen === this.state.panelOpen) return;
        // Keep popup above the absolute sheet after open/close.
        requestAnimationFrame(() => DebugFloat.show());
    }

    handleFabPositionChange = (left, top) => {
        const fabLeft = Math.max(0, Math.round(left));
        const fabTop = Math.max(0, Math.round(top));
        this.setState({fabLeft, fabTop});
        if (useNativeFab) {
            DebugFloat.setPosition(fabLeft, fabTop);
        }
    };

    getRef(index) {
        return ref => {
            if (!this.refsObj[index]) this.refsObj[index] = ref;
        };
    }

    addPanels() {
        let defaultPanels = [
            {
                title: 'Log',
                component: HocComp(Log, this.getRef(0)),
            },
        ];
        if (this.props.panels && this.props.panels.length) {
            this.props.panels.forEach((item, index) => {
                if (index >= 3) return;
                if (item.title && item.component) {
                    item.component = HocComp(
                        item.component,
                        this.getRef(defaultPanels.length),
                    );
                    defaultPanels.push(item);
                }
            });
        }
        return defaultPanels;
    }

    togglePanel = () => {
        this.setState(prev => ({panelOpen: !prev.panelOpen}));
    };

    closePanel = () => {
        if (this.state.panelOpen) {
            this.setState({panelOpen: false});
        }
    };

    clearLogs() {
        const tabName = this.state.panels[this.state.currentPageIndex].title;
        event.trigger('clear', tabName);
    }

    showDev() {
        NativeModules?.DevMenu?.show();
    }

    reloadDev() {
        NativeModules?.DevMenu?.reload();
    }

    copyLogs() {
        try {
            const logStack = getLogStack();
            if (!logStack) {
                Alert.alert('提示', '没有可复制的日志', [{text: '确认'}]);
                return;
            }
            const logs = logStack.getLogs();
            if (logs.length === 0) {
                Alert.alert('提示', '没有可复制的日志', [{text: '确认'}]);
                return;
            }
            const logText = logs
                .map(
                    log =>
                        `[${log.time}] [${log.method.toUpperCase()}] ${log.data}`,
                )
                .join('\n');
            Clipboard.setString(logText);
            Alert.alert('提示', '日志已复制到剪贴板', [{text: '确认'}]);
        } catch (error) {
            Alert.alert('错误', '复制日志失败: ' + error.message, [
                {text: '确认'},
            ]);
        }
    }

    async exportLogs() {
        try {
            const logStack = getLogStack();
            if (!logStack) {
                Alert.alert('提示', '没有可导出的日志', [{text: '确认'}]);
                return;
            }
            const logs = logStack.getLogs();
            if (logs.length === 0) {
                Alert.alert('提示', '没有可导出的日志', [{text: '确认'}]);
                return;
            }
            const logText = logs
                .map(
                    log =>
                        `[${log.time}] [${log.method.toUpperCase()}] ${log.data}`,
                )
                .join('\n');
            const now = new Date();
            const timestamp =
                now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') +
                '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');
            const fileName = `debug_logs_${timestamp}.txt`;
            const filePath = RNFS.DownloadDirectoryPath + '/' + fileName;
            await RNFS.writeFile(filePath, logText, 'utf8');
            Alert.alert('成功', `日志已导出到下载目录：${fileName}`, [
                {text: '确认'},
            ]);
        } catch (error) {
            Alert.alert('错误', '导出日志失败: ' + error.message, [
                {text: '确认'},
            ]);
        }
    }

    evalInContext(js, context) {
        return function (str) {
            let result = '';
            try {
                // eslint-disable-next-line no-eval
                result = eval(str);
            } catch (err) {
                result = 'Invalid input';
            }
            return event.trigger('addLog', result);
        }.call(context, `with(this) { ${js} } `);
    }

    execCommand() {
        if (!this.state.commandValue) return;
        this.evalInContext(this.state.commandValue, commandContext);
        this.syncHistory();
        Keyboard.dismiss();
    }

    clearCommand() {
        this.textInput && this.textInput.clear();
        this.setState({historyFilter: []});
    }

    scrollToPage(index, animated = true) {
        let cardIndex = index;
        if (cardIndex < 0) cardIndex = 0;
        else if (cardIndex >= this.state.panels.length)
            cardIndex = this.state.panels.length - 1;
        if (this.scrollView) {
            this.scrollView.scrollTo({
                x: SCREEN_W * cardIndex,
                y: 0,
                animated: animated,
            });
        }
    }

    scrollToTop() {
        const item = this.refsObj[this.state.currentPageIndex];
        const instance = item?.getScrollRef && item?.getScrollRef();
        if (instance) {
            instance.scrollToOffset &&
                instance.scrollToOffset({
                    animated: true,
                    viewPosition: 0,
                    index: 0,
                });
            instance.scrollTo &&
                instance.scrollTo({x: 0, y: 0, animated: true});
        }
    }

    renderPanelHeader() {
        return (
            <View style={styles.panelHeader}>
                {this.state.panels.map((item, index) => (
                    <TouchableOpacity
                        key={index.toString()}
                        onPress={() => {
                            if (index != this.state.currentPageIndex) {
                                this.scrollToPage(index);
                                this.setState({currentPageIndex: index});
                            } else {
                                this.scrollToTop();
                            }
                        }}
                        style={[
                            styles.panelHeaderItem,
                            index === this.state.currentPageIndex &&
                                styles.activeTab,
                        ]}>
                        <Text style={styles.panelHeaderItemText}>
                            {item.title}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    }

    syncHistory() {
        if (!Storage.support()) return;
        const res = this.state.history.filter(f => {
            return f == this.state.commandValue;
        });
        if (res && res.length) return;
        this.state.history.splice(0, 0, this.state.commandValue);
        this.state.historyFilter.splice(0, 0, this.state.commandValue);
        this.setState(
            {
                history: this.state.history,
                historyFilter: this.state.historyFilter,
            },
            () => {
                Storage.save('react-native-vdebug@history', this.state.history);
                this.forceUpdate();
            },
        );
    }

    onChange(text) {
        const state = {commandValue: text};
        if (text) {
            const res = this.state.history.filter(f =>
                f.toLowerCase().match(replaceReg(text)),
            );
            if (res && res.length) state.historyFilter = res;
        } else {
            state.historyFilter = [];
        }
        this.setState(state);
    }

    renderCommandBar() {
        return (
            <KeyboardAvoidingView
                keyboardVerticalOffset={Platform.OS == 'android' ? 0 : 300}
                contentContainerStyle={{flex: 1}}
                behavior={'position'}
                style={{
                    height: this.state.historyFilter.length ? 120 : 40,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: '#d9d9d9',
                    flexShrink: 0,
                }}>
                <View
                    style={[
                        styles.historyContainer,
                        {height: this.state.historyFilter.length ? 80 : 0},
                    ]}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {this.state.historyFilter.map((text, i) => {
                            return (
                                <TouchableOpacity
                                    key={String(i)}
                                    style={{
                                        borderBottomWidth: 1,
                                        borderBottomColor: '#eeeeeea1',
                                    }}
                                    onPress={() => {
                                        if (text && text.toString) {
                                            this.setState({
                                                commandValue: text.toString(),
                                            });
                                        }
                                    }}>
                                    <Text style={{lineHeight: 25}}>{text}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
                <View style={styles.commandBar}>
                    <TextInput
                        ref={ref => {
                            this.textInput = ref;
                        }}
                        style={styles.commandBarInput}
                        placeholderTextColor={'#000000a1'}
                        placeholder="Command..."
                        onChangeText={this.onChange.bind(this)}
                        value={this.state.commandValue}
                        onFocus={() => {
                            this.setState({showHistory: true});
                        }}
                        onSubmitEditing={this.execCommand.bind(this)}
                    />
                    <TouchableOpacity
                        style={styles.commandBarBtn}
                        onPress={this.clearCommand.bind(this)}>
                        <Text>X</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.commandBarBtn}
                        onPress={this.execCommand.bind(this)}>
                        <Text>OK</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        );
    }

    renderPanelFooter() {
        return (
            <View style={styles.panelBottom}>
                <TouchableOpacity
                    onPress={this.clearLogs.bind(this)}
                    style={styles.panelBottomBtn}>
                    <Text style={styles.panelBottomBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={this.copyLogs.bind(this)}
                    style={styles.panelBottomBtn}>
                    <Text style={styles.panelBottomBtnText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={this.exportLogs.bind(this)}
                    style={styles.panelBottomBtn}>
                    <Text style={styles.panelBottomBtnText}>Export</Text>
                </TouchableOpacity>
                {__DEV__ && Platform.OS == 'ios' && (
                    <TouchableOpacity
                        onPress={this.showDev.bind(this)}
                        onLongPress={this.reloadDev.bind(this)}
                        style={styles.panelBottomBtn}>
                        <Text style={styles.panelBottomBtnText}>Dev</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    onPress={this.togglePanel}
                    style={styles.panelBottomBtn}>
                    <Text style={styles.panelBottomBtnText}>Hide</Text>
                </TouchableOpacity>
            </View>
        );
    }

    onScrollAnimationEnd({nativeEvent}) {
        const currentPageIndex = Math.floor(
            nativeEvent.contentOffset.x / Math.floor(SCREEN_W),
        );
        currentPageIndex != this.state.currentPageIndex &&
            this.setState({
                currentPageIndex: currentPageIndex,
            });
    }

    renderPanelBody() {
        const pageHeight = Math.max(160, this.containerHeight - 120);
        return (
            <View style={[styles.panel, {height: this.containerHeight}]}>
                {this.renderPanelHeader()}
                <View style={{height: pageHeight, width: SCREEN_W}}>
                    <ScrollView
                        onMomentumScrollEnd={this.onScrollAnimationEnd.bind(
                            this,
                        )}
                        ref={ref => {
                            this.scrollView = ref;
                        }}
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        horizontal
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        style={{width: SCREEN_W, height: pageHeight}}>
                        {this.state.panels.map((item, index) => (
                            <View
                                key={index}
                                style={{
                                    width: SCREEN_W,
                                    height: pageHeight,
                                }}>
                                <item.component {...(item.props ?? {})} />
                            </View>
                        ))}
                    </ScrollView>
                </View>
                {this.renderCommandBar()}
                {this.renderPanelFooter()}
            </View>
        );
    }

    render() {
        const open = this.state.panelOpen;

        // Fixed pixel overlay — never a flex participant of the app column.
        return (
            <View
                style={styles.overlayHost}
                pointerEvents="box-none"
                collapsable={false}>
                {open ? (
                    <View
                        style={styles.panelLayer}
                        pointerEvents="box-none"
                        collapsable={false}>
                        <Pressable
                            style={styles.backdrop}
                            onPress={this.closePanel}
                            accessibilityLabel="关闭调试面板"
                        />
                        <View style={styles.panelDock} collapsable={false}>
                            <GestureHandlerRootView style={styles.panelGh}>
                                {this.renderPanelBody()}
                            </GestureHandlerRootView>
                        </View>
                    </View>
                ) : null}

                {/* iOS only — Android uses PopupWindow FAB */}
                {!useNativeFab ? (
                    <DebugFab
                        onToggle={this.togglePanel}
                        left={this.state.fabLeft}
                        top={this.state.fabTop}
                        onPositionChange={this.handleFabPositionChange}
                    />
                ) : null}
            </View>
        );
    }
}

const styles = StyleSheet.create({
    // Explicit screen size, not percentage / flex — avoids Yoga reflow bugs
    // that push the music bar when a tall absolute child mounts.
    overlayHost: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: 'transparent',
        zIndex: 99990,
        elevation: 0,
    },
    panelLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: 'transparent',
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    // Sheet pinned to bottom with fixed height — not flex:1 growth.
    panelDock: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: SCREEN_W,
        height: Math.floor((SCREEN_H / 3) * 2),
    },
    panelGh: {
        flex: 1,
    },
    activeTab: {
        backgroundColor: '#fff',
    },
    panel: {
        width: SCREEN_W,
        backgroundColor: '#fff',
        overflow: 'hidden',
        flexDirection: 'column',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        elevation: 8,
    },
    panelHeader: {
        width: SCREEN_W,
        backgroundColor: '#eee',
        flexDirection: 'row',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#d9d9d9',
        flexShrink: 0,
        alignItems: 'center',
    },
    panelHeaderItem: {
        flex: 1,
        height: 40,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: '#d9d9d9',
        justifyContent: 'center',
    },
    panelHeaderItemText: {
        textAlign: 'center',
        color: '#000',
    },
    panelBottom: {
        width: SCREEN_W,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#d9d9d9',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#eee',
        height: 40,
        flexShrink: 0,
    },
    panelBottomBtn: {
        flex: 1,
        height: 40,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: '#d9d9d9',
        justifyContent: 'center',
    },
    panelBottomBtnText: {
        color: '#000',
        fontSize: 14,
        textAlign: 'center',
    },
    commandBar: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#d9d9d9',
        flexDirection: 'row',
        height: 40,
        flexShrink: 0,
    },
    commandBarInput: {
        flex: 1,
        paddingLeft: 10,
        backgroundColor: '#ffffff',
        color: '#000000',
    },
    commandBarBtn: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#eee',
    },
    historyContainer: {
        borderTopWidth: 1,
        borderTopColor: '#d9d9d9',
        backgroundColor: '#ffffff',
        paddingHorizontal: 10,
    },
});

export default VDebug;
