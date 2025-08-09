declare namespace IFileNaming {
    /**
     * 文件命名模板变量
     */
    export interface ITemplateVariables {
        /** 歌曲名 */
        title: string;
        /** 歌手 */
        artist: string;
        /** 专辑 */
        album: string;
        /** 音质 */
        quality?: string;
        /** 平台 */
        platform: string;
        /** 歌曲ID */
        id: string;
        /** 别名 */
        alias?: string;
    }

    /**
     * 预设的文件命名模板
     */
    export type IPresetTemplate = 
        | "歌曲名"
        | "歌曲名-歌手"
        | "歌手-歌曲名"
        | "歌曲名-歌手-音质"
        | "歌曲名-歌手-专辑"
        | "歌手-专辑-歌曲名";

    /**
     * 文件命名配置
     */
    export interface IFileNamingConfig {
        /** 使用的模板类型：预设模板或自定义模板 */
        type: "preset" | "custom";
        /** 预设模板（当type为preset时使用） */
        preset?: IPresetTemplate;
        /** 自定义模板（当type为custom时使用） */
        custom?: string;
        /** 最大文件名长度 */
        maxLength: number;
        /** 截断时是否保留扩展名 */
        keepExtension: boolean;
    }

    /**
     * 文件命名选项
     */
    export interface IFormatOptions {
        /** 模板字符串 */
        template: string;
        /** 模板变量 */
        variables: ITemplateVariables;
        /** 最大文件名长度（默认200） */
        maxLength?: number;
        /** 是否保留扩展名（当截断时） */
        keepExtension?: boolean;
    }

    /**
     * 格式化结果
     */
    export interface IFormatResult {
        /** 格式化后的文件名 */
        filename: string;
        /** 是否被截断 */
        truncated: boolean;
        /** 原始长度 */
        originalLength: number;
    }
}