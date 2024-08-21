document.getElementById('fileInput').addEventListener('change', function() {
    document.getElementById('uploadButton').disabled = false;
});

document.getElementById('uploadButton').addEventListener('click', function() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const enableEncryption = document.getElementById('encryptCheckbox').checked;
    const isStickerBasePackage = document.getElementById('stickerCheckbox').checked;
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
        processFile(file.name, arrayBuffer, enableEncryption, isStickerBasePackage);
    };

    reader.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentLoaded = Math.round((e.loaded / e.total) * 100);
            progressElement.textContent = `读取进度: ${percentLoaded}%`;
        }
    };

    reader.readAsArrayBuffer(file);
});

function processFile(filename, arrayBuffer, enableEncryption, isStickerBasePackage) {
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const zip = new JSZip();
    
    statusElement.textContent = '解压缩文件...';
    zip.loadAsync(arrayBuffer).then(function(contents) {
        let newFilename = '';
        let tasks = [];

        if (filename.endsWith('.bdi')) {
            newFilename = filename.replace('.bdi', '.bds');
            if (isStickerBasePackage) {
                // 贴纸底包：将 skin/ 下的所有文件和文件夹移动到根目录
                const skinFolder = zip.folder("skin");
                if (skinFolder) {
                    skinFolder.forEach(function(relativePath, file) {
                        const newPath = relativePath.replace(/^skin\//, ''); // 移除 "skin/" 前缀
                        tasks.push(
                            file.async("uint8array").then(function(content) {
                                zip.file(newPath, content);
                                zip.remove("skin/" + relativePath);
                            })
                        );
                    });
                }
            } else {
                // 普通包处理逻辑 (如适用)
            }

        } else if (filename.endsWith('.bds')) {
            newFilename = filename.replace('.bds', '.bdi');
            if (isStickerBasePackage) {
                // 贴纸底包：将根目录下的所有文件和文件夹移动到 skin/ 目录
                const rootFiles = Object.keys(contents.files);
                rootFiles.forEach(function(filePath) {
                    if (!filePath.startsWith("skin/") && !contents.files[filePath].dir) {
                        const newPath = "skin/" + filePath;
                        const file = zip.file(filePath);
                        if (file) {
                            tasks.push(
                                file.async("uint8array").then(function(content) {
                                    zip.file(newPath, content);
                                    zip.remove(filePath);
                                })
                            );
                        }
                    }
                });
            } else {
                // 普通包处理逻辑 (如适用)
            }
        } else {
            console.error("Unsupported file type:", filename);
            throw new Error("不支持的文件类型: " + filename);
        }

        return Promise.all(tasks).then(() => {
            console.log("Generated newFilename:", newFilename);

            if (!newFilename) {
                throw new Error("无法生成新的文件名。");
            }

            statusElement.textContent = '生成新的压缩包...';

            if (enableEncryption) {
                return zip.generateAsync({type: "uint8array"}).then(function(data) {
                    return modifyZipFile(data, newFilename);
                }).then(function(blob) {
                    downloadFile(blob, newFilename);
                });
            } else {
                return zip.generateAsync({type: "blob"}).then(function(blob) {
                    downloadFile(blob, newFilename);
                });
            }
        });
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

function downloadFile(blob, newFilename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = newFilename;
    link.textContent = `下载 ${newFilename}`;
    
    const outputElement = document.getElementById('output');
    outputElement.appendChild(link);

    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');

    statusElement.textContent = '处理完成!';
    progressElement.classList.add('hidden');
}
