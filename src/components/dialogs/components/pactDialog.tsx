import React, { useEffect, useMemo, useState } from "react";
import { View, ScrollView, StyleSheet, Linking, BackHandler, TouchableOpacity } from "react-native";
import rpx, { vh } from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";
import Config from "@/core/appConfig";
import NativeUtils from "@/native/utils";
import { hideDialog } from "../useDialog";
import Toast from "@/utils/toast";

const COUNTDOWN_SECONDS = 30;

function PactDialog() {
    const colors = useColors();
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const isAgreePact = Config.getConfig("common.isAgreePact");

    const openUrl = (url: string) => {
        Linking.openURL(url).catch(() => {
            Toast.warn("无法打开链接");
        });
    };

    const openHomePage = () => {
        openUrl("https://github.com/Toskysun/MusicFree#readme");
    };

    const openLicensePage = () => {
        openUrl("https://www.gnu.org/licenses/agpl-3.0.html");
    };

    const handleReject = () => {
        NativeUtils.exitApp();
    };

    const handleAccept = () => {
        Config.setConfig("common.isAgreePact", true);
        hideDialog();
        setTimeout(() => {
            Toast.success("本软件完全免费且开源，如果你是花钱购买的，请直接给差评！");
        }, 1500);
    };

    const handleClose = () => {
        if (isAgreePact) {
            hideDialog();
        }
    };

    const btnState = useMemo(() => {
        if (isAgreePact) {
            return { disabled: false, text: "关闭" };
        }
        return countdown > 0
            ? { disabled: true, text: `接受（${countdown}）` }
            : { disabled: false, text: "接受" };
    }, [isAgreePact, countdown]);

    useEffect(() => {
        if (isAgreePact) return;

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isAgreePact]);

    useEffect(() => {
        if (isAgreePact) return;

        const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
            return true;
        });

        return () => backHandler.remove();
    }, [isAgreePact]);

    const linkStyle = {
        color: colors.primary,
        textDecorationLine: "underline" as const,
    };

    return (
        <View style={styles.overlay}>
            <View style={[styles.container, { backgroundColor: colors.backdrop }]}>
                <ThemeText fontSize="title" fontWeight="bold" style={styles.title}>
                    许可协议
                </ThemeText>

                <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator>
                    {!isAgreePact && (
                        <ThemeText style={styles.boldText}>
                            在使用本软件前，你（使用者）需签署本协议才可继续使用！{"\n"}
                        </ThemeText>
                    )}

                    <ThemeText style={styles.text}>
                        本项目基于{" "}
                        <ThemeText style={linkStyle} onPress={openLicensePage}>
                            AGPL-3.0
                        </ThemeText>{" "}
                        许可证发行，以下协议是对于 AGPL-3.0 的补充，如有冲突，以以下协议为准。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.text}>
                        词语约定：本协议中的"本项目"指 MusicFree
                        项目；"使用者"指签署本协议的使用者；"版权数据"指包括但不限于图像、音频、名字等在内的他人拥有所属版权的数据。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>一、数据来源{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        1.1
                        本项目的数据来源原理是从各音乐平台的公开服务器中拉取数据，经过对数据简单地筛选与合并后进行展示，因此本项目不对数据的准确性负责。
                        {"\n"}
                    </ThemeText>
                    <ThemeText style={styles.text}>
                        1.2
                        本项目本身没有获取某个音频数据的能力，本项目使用的在线音频数据来源来自软件设置内"插件"所选择的"源"返回的在线链接。例如播放某首歌，本项目所做的只是将希望播放的歌曲名、艺术家等信息传递给"源"，若"源"返回了一个链接，则本项目将认为这就是该歌曲的音频数据而进行使用，至于这是不是正确的音频数据本项目无法校验其准确性，所以使用本项目的过程中可能会出现希望播放的音频与实际播放的音频不对应或者无法播放的问题。
                        {"\n"}
                    </ThemeText>
                    <ThemeText style={styles.text}>
                        1.3
                        本项目的非官方平台数据（例如"本地歌单"内列表）来自使用者本地系统或者使用者连接的同步服务，本项目不对这些数据的合法性、准确性负责。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>二、版权数据{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        2.1
                        使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在{" "}
                        <ThemeText style={styles.boldText}>24 小时内</ThemeText>{" "}
                        清除使用本项目的过程中所产生的版权数据。{"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>三、资源使用{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        3.1
                        本项目内使用的部分包括但不限于字体、图片等资源来源于互联网。如果出现侵权可联系本项目移除。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>四、免责声明{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        4.1
                        由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>五、使用限制{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        5.1 本项目完全免费，且开源发布于{" "}
                        <ThemeText style={linkStyle} onPress={openHomePage}>
                            GitHub
                        </ThemeText>{" "}
                        面向全世界人用作对技术的学习交流，本项目不对项目内的技术可能存在违反当地法律法规的行为作保证。
                        {"\n"}
                    </ThemeText>
                    <ThemeText style={styles.text}>
                        5.2{" "}
                        <ThemeText style={styles.boldText}>
                            禁止在违反当地法律法规的情况下使用本项目
                        </ThemeText>
                        ，对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>六、隐私政策{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        6.1
                        本项目不会收集、存储或传输任何用户个人信息。所有数据均存储在用户本地设备上。
                        {"\n"}
                    </ThemeText>
                    <ThemeText style={styles.text}>
                        6.2
                        本项目不包含任何追踪器、广告或分析工具。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>七、版权保护{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        7.1 音乐平台不易，请尊重版权，支持正版。{"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>八、非商业性质{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        8.1
                        本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。
                        {"\n"}
                    </ThemeText>

                    <ThemeText style={styles.boldText}>九、接受协议{"\n"}</ThemeText>
                    <ThemeText style={styles.text}>
                        9.1 若你使用了本项目，将代表你接受本协议。{"\n"}
                    </ThemeText>

                    <ThemeText style={styles.text}>
                        * 若协议更新，恕不另行通知，可到开源地址查看。
                    </ThemeText>
                </ScrollView>

                {!isAgreePact && (
                    <ThemeText style={styles.tip}>
                        若你（使用者）接受以上协议，请点击下面的"接受"按钮签署本协议；若不接受，请点击"不接受"后退出软件并清除本软件的所有数据。
                    </ThemeText>
                )}

                <View style={styles.btnContainer}>
                    {!isAgreePact && (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.btn, { backgroundColor: colors.placeholder }]}
                            onPress={handleReject}
                        >
                            <ThemeText>不接受</ThemeText>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={btnState.disabled}
                        style={[
                            styles.btn,
                            {
                                backgroundColor: btnState.disabled
                                    ? colors.placeholder
                                    : colors.primary,
                                opacity: btnState.disabled ? 0.6 : 1,
                            },
                        ]}
                        onPress={isAgreePact ? handleClose : handleAccept}
                    >
                        <ThemeText color={btnState.disabled ? undefined : "white"}>
                            {btnState.text}
                        </ThemeText>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: "absolute",
        zIndex: 16400,
        width: "100%",
        height: "100%",
        left: 0,
        top: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        alignItems: "center",
        justifyContent: "center",
    },
    container: {
        width: "90%",
        maxHeight: vh(85),
        borderRadius: rpx(16),
        paddingTop: rpx(24),
        paddingBottom: rpx(24),
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 5,
    },
    title: {
        textAlign: "center",
        marginBottom: rpx(16),
    },
    scrollContent: {
        maxHeight: vh(50),
        paddingHorizontal: rpx(24),
    },
    text: {
        fontSize: 14,
        lineHeight: 22,
        marginBottom: rpx(8),
    },
    boldText: {
        fontSize: 14,
        lineHeight: 22,
        fontWeight: "bold",
        marginBottom: rpx(8),
    },
    tip: {
        fontSize: 13,
        fontWeight: "bold",
        paddingHorizontal: rpx(24),
        paddingTop: rpx(16),
        paddingBottom: rpx(8),
    },
    btnContainer: {
        flexDirection: "row",
        justifyContent: "center",
        paddingHorizontal: rpx(24),
        paddingTop: rpx(16),
        gap: rpx(16),
    },
    btn: {
        flex: 1,
        height: rpx(80),
        borderRadius: rpx(8),
        alignItems: "center",
        justifyContent: "center",
    },
});

export default PactDialog;
