const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const zlib = require("zlib");
const asar = require("asar");
const pinyin = require("pinyinlite");

const pluginsDir = "./plugins";
const infoFileName = "plugins-info.json";
const packedPlugins = "plugins.asar";

if (fs.existsSync(packedPlugins)) {
  try {
    asar.extractAll(packedPlugins, pluginsDir);
  } catch (err) {
    console.log(`文件 ${gzipedPluginsFileName} 不符合格式`);
  }
  fs.unlinkSync(packedPlugins);
} else {
  let pluginsInfo = [];

  fs.readdirSync(pluginsDir).forEach((filename) => {
    let filePath = path.join(pluginsDir, filename);
    let asarFilePath = path.join(
      pluginsDir,
      path.basename(filename, path.extname(filename)) + ".asar"
    );
    let pluginJsonContent;

    /* 计算插件 md5 */
    let upxMd5 = crypto
      .createHash("md5")
      .update(fs.readFileSync(filePath))
      .digest("hex");
    let asarMd5; // upx 解压后得到的 asar 文件的 md5

    /* 获取插件内的 plugin.json 文件的内容 */
    try {
      fs.writeFileSync(
        asarFilePath,
        zlib.gunzipSync(fs.readFileSync(filePath))
      );
      asarMd5 = crypto
        .createHash("md5")
        .update(fs.readFileSync(asarFilePath))
        .digest("hex");
      pluginJsonContent = JSON.parse(
        asar.extractFile(asarFilePath, "plugin.json")
      );
      fs.unlinkSync(asarFilePath);
    } catch (err) {
      console.log(`文件 ${filename} 不符合 uTools 插件格式，自动删除该文件`);
      if (fs.existsSync(asarFilePath)) fs.unlinkSync(asarFilePath);
      fs.unlinkSync(filePath);
      return;
    }

    /* 提取有用的信息 */
    let pluginInfo = {
      name: pluginJsonContent.pluginName,
      version:
        pluginJsonContent.version[0].toLowerCase() == "v"
          ? pluginJsonContent.version.toLowerCase()
          : "v" + pluginJsonContent.version,
      description: pluginJsonContent.description,
      upxMd5,
      asarMd5,
      fileName: "",
      url: "",
    };

    let trueFileName = `${pluginInfo.name.replace(/[ /]+/g, "-")}-${
      pluginInfo.version
    }.upx`;
    pluginInfo.fileName = trueFileName;
    pluginInfo.url = `https://cdn.jsdelivr.net/gh/marsvet/uTools-plugins-collection/plugins/${trueFileName}`;
    if (
      filename != trueFileName &&
      fs.readdirSync(pluginsDir).indexOf(trueFileName) !== -1
    ) {
      console.log(`文件 ${filename} 对应的插件已存在，自动删除该文件`);
      fs.unlinkSync(filePath);
      return;
    }

    fs.renameSync(filePath, path.join(pluginsDir, trueFileName));

    pluginsInfo.push(pluginInfo);
  });

  /**
   * 对 pluginsInfo 按 name 和 version 排序，并写入 plugins-info.json 文件
   */
  let asciiHead = []; // 首字符非中文的（字母，数字，符号等）
  let zhCharHead = []; // 首字符为中文的
  pluginsInfo.forEach((pluginInfo) => {
    // 判断是否为中文
    if (/^[\u4e00-\u9fa5]*$/.test(pluginInfo.name[0])) {
      zhCharHead.push(pluginInfo);
    } else {
      asciiHead.push(pluginInfo);
    }
  });
  asciiHead.sort((item1, item2) => {
    let result = item1.name.localeCompare(item2.name);
    if (result == 0) result = item1.version.localeCompare(item2.version);
    return result;
  });
  zhCharHead.sort((item1, item2) => {
    let result = pinyin(item1.name)
      .join("")
      .localeCompare(pinyin(item2.name).join(""));
    if (result == 0) result = item1.version.localeCompare(item2.version);
    return result;
  });
  pluginsInfo = asciiHead.concat(zhCharHead);
  fs.writeFileSync(infoFileName, JSON.stringify(pluginsInfo));

  /**
   * 创建 README.md 文件
   */
  let markdownString = "";
  // let catalogString = "";
  let pluginsListString = "";
  let readmeTemplate = fs.readFileSync("README_TEMPLATE.md").toString();
  let prevPluginName = "";
  pluginsInfo.forEach((pluginInfo) => {
    if (!(pluginInfo.name == prevPluginName)) {
      // catalogString += `- ${pluginInfo.name}\n\n`;
      pluginsListString += `### ${pluginInfo.name}\n\n${pluginInfo.description}\n\n- [${pluginInfo.fileName}](${pluginInfo.url})\n\n`;
      prevPluginName = pluginInfo.name;
    } else {
      pluginsListString += `- [${pluginInfo.fileName}](${pluginInfo.url})\n\n`;
    }
  });
  markdownString = readmeTemplate
    // .replace("{{ catalog }}", catalogString)
    .replace("{{ plugins }}", pluginsListString);
  fs.writeFileSync("README.md", markdownString);
}
