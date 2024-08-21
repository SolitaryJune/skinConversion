document.getElementById('fileInput').addEventListener('change', function() {
    document.getElementById('uploadButton').disabled = false;
});

document.getElementById('uploadButton').addEventListener('click', function() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const enableEncryption = document.getElementById('encryptCheckbox').checked;
    const reader = new FileReader();

    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        processFile(file.name, arrayBuffer, enableEncryption);
    };

    reader.readAsArrayBuffer(file);
});

function processFile(filename, arrayBuffer, enableEncryption) {
    const zip = new JSZip();
    zip.loadAsync(arrayBuffer).then(function(contents) {
        let cssFile;
        let skinFolder = false;

        // 检查是 .bdi 文件还是 .bds 文件
        if (filename.endsWith('.bdi')) {
            // .bdi 应该有 skin/res/default.css
            cssFile = zip.file("skin/res/default.css");
            skinFolder = true;
        } else if (filename.endsWith('.bds')) {
            // .bds 应该有 res/default.css
            cssFile = zip.file("res/default.css");
        }

        if (!cssFile) {
            throw new Error("无法找到 default.css 文件。请确保文件路径正确。");
        }
        return cssFile.async("string").then(function(cssContent) {
            return { cssContent, skinFolder };
        });
    }).then(function(data) {
        let { cssContent, skinFolder } = data;
        let modifiedCss = cssContent;
        let newFilename = '';

        if (filename.endsWith('.bds')) {
            // 修改为 .bdi
            modifiedCss = modifiedCss.replace(/\.ogg/g, '.aiff');
            modifiedCss = modifiedCss.replace(/NM_IMG=abj,1/g, 'NM_IMG=acand,1');
            newFilename = filename.replace('.bds', '.bdi');

            // 添加 skin 文件夹
            zip.folder("skin").folder("res").file("default.css", modifiedCss);
            zip.remove("res");  // 删除原来的 res 目录

        } else if (filename.endsWith('.bdi')) {
            // 修改为 .bds
            modifiedCss = modifiedCss.replace(/\.aiff/g, '.ogg');
            modifiedCss = modifiedCss.replace(/NM_IMG=acand,1/g, 'NM_IMG=abj,1');
            newFilename = filename.replace('.bdi', '.bds');

            // 移动文件并删除 skin 文件夹
            zip.folder("res").file("default.css", modifiedCss);
            zip.remove("skin");  // 删除 skin 目录
        }

        if (enableEncryption) {
            // 启用伪加密
            return zip.generateAsync({type: "uint8array"}).then(function(data) {
                return modifyZipFile(data, newFilename);
            });
        } else {
            return zip.generateAsync({type: "blob"});
        }
    }).then(function(blob) {
        // 创建下载链接
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = newFilename;
        link.textContent = `下载 ${newFilename}`;
        document.getElementById('output').appendChild(link);
    }).catch(function(error) {
        console.error("处理文件时出错:", error.message);
        alert("处理文件时出错: " + error.message);
    });
}

function modifyZipFile(data, filename) {
    return new Promise((resolve, reject) => {
        try {
            // 创建DataView以便于操作二进制数据
            const view = new DataView(data.buffer);
            const PK_SIGNATURE = 0x504B0304;
            const CDFH_SIGNATURE = 0x504B0102;

            // 查找所有本地文件头和中心目录文件头
            for (let i = 0; i < view.byteLength - 4; i++) {
                const signature = view.getUint32(i, true);
                if (signature === PK_SIGNATURE) {
                    // 修改本地文件头的全局加密标志
                    view.setUint16(i + 6, 0x0900, true);
                } else if (signature === CDFH_SIGNATURE) {
                    // 修改中心目录文件头的全局加密标志
                    view.setUint16(i + 8, 0x0900, true);
                }
            }

            resolve(new Blob([data]));
        } catch (error) {
            reject(error);
        }
    });
}
