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
        return zip.file("res/default.css").async("string");
    }).then(function(cssContent) {
        let modifiedCss = cssContent;
        let newFilename = '';

        if (filename.endsWith('.bds')) {
            modifiedCss = modifiedCss.replace(/\.ogg/g, '.aiff');
            modifiedCss = modifiedCss.replace(/NM_IMG=abj,1/g, 'NM_IMG=acand,1');
            newFilename = filename.replace('.bds', '.bdi');
        } else if (filename.endsWith('.bdi')) {
            modifiedCss = modifiedCss.replace(/\.aiff/g, '.ogg');
            modifiedCss = modifiedCss.replace(/NM_IMG=acand,1/g, 'NM_IMG=abj,1');
            newFilename = filename.replace('.bdi', '.bds');
        }

        // 更新压缩包中的 CSS 文件
        zip.file("res/default.css", modifiedCss);

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
        console.error("处理文件时出错:", error);
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
