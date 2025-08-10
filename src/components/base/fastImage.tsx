import React, { useEffect, useState } from "react";
import { ImageRequireSource } from "react-native";
import FastImage, { FastImageProps } from "react-native-fast-image";
import { devLog } from "@/utils/log";

interface IFastImageProps {
    style: FastImageProps["style"];
    defaultSource?: FastImageProps["defaultSource"];
    placeholderSource?: ImageRequireSource;
    source?: FastImageProps["source"] | string;
}
export default function (props: IFastImageProps) {
    const { style, placeholderSource, defaultSource, source } = props ?? {};
    const [isError, setIsError] = useState(false);


    let realSource: FastImageProps["source"];
    if (typeof source === "string") {
        realSource = { uri: source };
        if (source.length === 0) {
            realSource = placeholderSource;
        }
    } else if (source){
        realSource = source;
    } else {
        realSource = placeholderSource;
    }


    useEffect(() => {
        setIsError(false);
    }, [source]);


    return (
        <FastImage
            style={style}
            source={isError ? placeholderSource : realSource}
            onError={() => {
                setIsError(true);
                devLog("warn", "🖼️[图片组件] 图片加载失败", { source: realSource });
            }}
            defaultSource={defaultSource}
        />
    );
}
