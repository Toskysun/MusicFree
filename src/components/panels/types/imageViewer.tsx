import React from "react";
import { Image, StyleSheet } from "react-native";
import rpx, { vh, vw } from "@/utils/rpx";
import Toast from "@/utils/toast";
import useOrientation from "@/hooks/useOrientation.ts";
import { saveToGallery } from "@/utils/fileUtils.ts";
import { errorLog } from "@/utils/log.ts";
import PanelFullscreen from "@/components/panels/base/panelFullscreen.tsx";
import { Button } from "@/components/base/button.tsx";
import { useI18N } from "@/core/i18n";

interface IImageViewerProps {
    // 图片路径
    url: string;
}

export default function ImageViewer(props: IImageViewerProps) {
    const { url } = props;
    const orientation = useOrientation();
    const { t } = useI18N();

    return (
        <PanelFullscreen
            hasMask
            animationType="Scale"
            containerStyle={styles.container}>
            <Image
                style={[
                    styles.image,
                    orientation === "vertical"
                        ? styles.imageVertical
                        : styles.imageHorizontal,
                ]}
                source={{
                    uri: url,
                }}
            />
            <Button
                text={t("panel.imageViewer.saveImage")}
                type="primary"
                style={styles.button}
                onPress={() => {
                    saveToGallery(url)
                        .then((resultPath) => {
                            Toast.success(t("panel.imageViewer.saveImageSuccess", {
                                path: resultPath,
                            }));
                        }).catch(e => {
                            errorLog("Save failed", e?.message ?? e);
                            Toast.warn(t("panel.imageViewer.saveImageFail", {
                                reason: e?.message ?? e,
                            }));
                        });
                }}
            />
        </PanelFullscreen>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: "center",
        alignItems: "center",
        gap: rpx(48),
    },
    image: {
        resizeMode: "cover",
    },
    imageVertical: {
        width: vw(100),
        minHeight: vw(100),
        maxHeight: vh(100),
    },
    imageHorizontal: {
        maxWidth: vw(80),
        height: vh(60),
        minWidth: vh(60),
    },
    button: {
        marginHorizontal: rpx(24),
        paddingHorizontal: rpx(200),
    },
});
