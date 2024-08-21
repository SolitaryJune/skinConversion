document.getElementById('fileInput').addEventListener('change', function() {
    document.getElementById('uploadButton').disabled = false;
});

document.getElementById('uploadButton').addEventListener('click', function() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const enableEncryption = document.getElementById('encryptCheckbox').checked;
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const outputElement = document.getElementById('output');
    
    statusElement.classList.remove('hidden');
    progressElement.classList.remove('hidden');
    outputElement.innerHTML = ''; // 清空之前的输出内容
    statusElement.textContent = '文件正在读取...';
    
    const reader = new FileReader();

    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        processFile(file.name, arrayBuffer, enableEncryption);
    };

    reader.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentLoaded = Math.round((e.loaded / e.total) * 100);
            progressElement.textContent = `读取进度: ${percentLoaded}%`;
        }
    };

    reader.readAsArrayBuffer(file);
});

function processFile(filename, arrayBuffer, enableEncryption) {
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const zip = new JSZip();
    
    statusElement.textContent = '解压缩文件...';
    zip.loadAsync(arrayBuffer).then(function(contents) {
        let cssFile;
        let skinFolder = false;

        console.log("Processing file:", filename);

        if (filename.endsWith('.bdi')) {
            cssFile = zip.file("skin/res/default.css");
            skinFolder = true;
        } else if (filename.endsWith('.bds')) {
            cssFile = zip.file("res/default.css");
        }

        if (!cssFile) {
            throw new Error("无法找到 default.css 文件。请确保文件路径正确。");
        }

        statusElement.textContent = '处理 CSS 文件...';
        return cssFile.async("string").then(function(cssContent) {
            return { cssContent, skinFolder };
        });
    }).then(function(data) {
        let { cssContent, skinFolder } = data;
        let modifiedCss = cssContent;
        let newFilename = '';

        if (filename.endsWith('.bds')) {
            modifiedCss = modifiedCss.replace(/\.ogg/g, '.aiff');
            modifiedCss = modifiedCss.replace(/NM_IMG=abj,1/g, 'NM_IMG=acand,1');
            newFilename = filename.replace('.bds', '.bdi');
            zip.folder("skin").folder("res").file("default.css", modifiedCss);
            zip.remove("res");
        } else if (filename.endsWith('.bdi')) {
            modifiedCss = modifiedCss.replace(/\.aiff/g, '.ogg');
            modifiedCss = modifiedCss.replace(/NM_IMG=acand,1/g, 'NM_IMG=abj,1');
            newFilename = filename.replace('.bdi', '.bds');
            zip.folder("res").file("default.css", modifiedCss);
            zip.remove("skin");
        } else {
            console.error("Unsupported file type:", filename);
            throw new Error("不支持的文件类型: " + filename);
        }

        console.log("Generated newFilename:", newFilename);

        if (!newFilename) {
            throw new Error("无法生成新的文件名。");
        }

        statusElement.textContent = '生成新的压缩包...';

        if (enableEncryption) {
            return zip.generateAsync({type: "uint8array"}).then(function(data) {
                return modifyZipFile(data, newFilename);
            });
        } else {
            return zip.generateAsync({type: "blob"});
        }
    }).then(function(blob) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = newFilename;
        link.textContent = `下载 ${newFilename}`;
        
        const outputElement = document.getElementById('output');
        outputElement.appendChild(link);

        statusElement.textContent = '处理完成!';
        progressElement.classList.add('hidden');
    }).catch(function(error) {
        console.error("处理文件时出错:", error.message);
        alert("处理文件时出错: " + error.message);
        statusElement.textContent = '处理文件时出错。';
        progressElement.classList.add('hidden');
    });
}

function modifyZipFile(data, filename) {
    return new Promise((resolve, reject) => {
        try {
            const view = new DataView(data.buffer);
            const PK_SIGNATURE = 0x504B0304;
            const CDFH_SIGNATURE = 0x504B0102;

            for (let i = 0; i < view.byteLength - 4; i++) {
                const signature = view.getUint32(i, true);
                if (signature === PK_SIGNATURE) {
                    view.setUint16(i + 6, 0x0900, true);
                } else if (signature === CDFH_SIGNATURE) {
                    view.setUint16(i + 8, 0x0900, true);
                }
            }

            resolve(new Blob([data]));
        } catch (error) {
            reject(error);
        }
    });
}
