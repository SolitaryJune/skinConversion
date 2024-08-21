document.getElementById('fileInput').addEventListener('change', function() {
    document.getElementById('uploadButton').disabled = false;
});

document.getElementById('uploadButton').addEventListener('click', function() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const enableEncryption = document.getElementById('encryptCheckbox').checked;
    const isStickerPackage = document.getElementById('stickerCheckbox').checked;
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
        processFile(file.name, arrayBuffer, enableEncryption, isStickerPackage);
    };

    reader.onprogress = function(e) {
        if (e.lengthComputable) {
            const percentLoaded = Math.round((e.loaded / e.total) * 100);
            progressElement.textContent = `读取进度: ${percentLoaded}%`;
        }
    };

    reader.readAsArrayBuffer(file);
});

function processFile(filename, arrayBuffer, enableEncryption, isStickerPackage) {
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const zip = new JSZip();
    
    statusElement.textContent = '解压缩文件...';
    zip.loadAsync(arrayBuffer).then(function(contents) {
        let newFilename = '';
        let tasks = [];

        if (filename.endsWith('.bdi')) {
            newFilename = filename.replace('.bdi', '.bds');
            tasks = handleBDItoBDS(zip, isStickerPackage);
        } else if (filename.endsWith('.bds')) {
            newFilename = filename.replace('.bds', '.bdi');
            tasks = handleBDStoBDI(zip, isStickerPackage);
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

function handleBDItoBDS(zip, isStickerPackage) {
    let tasks = [];
    
    if (isStickerPackage) {
        // 处理贴纸底包转换
        tasks.push(updateInfoTxt(zip, "skin/Info.txt", "SupportPlatform=SWIA", "SupportPlatform=I", "AtomSkinName=light,dark"));
        tasks.push(updateTilFiles(zip, "skin/light/skin/res/abj.til", updateTilForBDS));
        tasks.push(updateTilFiles(zip, "skin/dark/skin/res/abj.til", updateTilForBDS));

        const skinFolder = zip.folder("skin");
        if (skinFolder) {
            skinFolder.forEach(function(relativePath, file) {
                const newPath = relativePath.replace(/^skin\/([^\/]+)\/skin\//, '$1/');
                tasks.push(
                    file.async("uint8array").then(function(content) {
                        zip.file(newPath, content);
                        zip.remove("skin/" + relativePath);
                    })
                );
            });
        }
    } else {
        // 将 skin/ 下的所有文件和文件夹移动到 res/
        const skinFolder = zip.folder("skin");
        if (skinFolder) {
            skinFolder.forEach(function(relativePath, file) {
                const newPath = "res/" + relativePath;
                tasks.push(
                    file.async("uint8array").then(function(content) {
                        zip.file(newPath, content);
                        zip.remove("skin/" + relativePath);
                    })
                );
            });
        }
    }

    return tasks;
}

function handleBDStoBDI(zip, isStickerPackage) {
    let tasks = [];
    
    if (isStickerPackage) {
        // 处理贴纸底包转换
        tasks.push(updateInfoTxt(zip, "Info.txt", "SupportPlatform=I", "SupportPlatform=SWIA", "", "AtomSkinName=light,dark"));
        tasks.push(updateTilFiles(zip, "light/res/abj.til", updateTilForBDI));
        tasks.push(updateTilFiles(zip, "dark/res/abj.til", updateTilForBDI));

        zip.forEach(function(relativePath, file) {
            if (!relativePath.startsWith("skin/")) {
                const newPath = "skin/" + relativePath.replace(/^([^\/]+)\//, '$1/skin/');
                tasks.push(
                    file.async("uint8array").then(function(content) {
                        zip.file(newPath, content);
                        zip.remove(relativePath);
                    })
                );
            }
        });
    } else {
        // 将 res/ 下的所有文件和文件夹移动到 skin/res/
        const resFolder = zip.folder("res");
        if (resFolder) {
            resFolder.forEach(function(relativePath, file) {
                const newPath = "skin/res/" + relativePath;
                tasks.push(
                    file.async("uint8array").then(function(content) {
                        zip.file(newPath, content);
                        zip.remove("res/" + relativePath);
                    })
                );
            });
        }
    }

    return tasks;
}

function updateInfoTxt(zip, path, oldPlatform, newPlatform, removeLine, addLine) {
    const infoFile = zip.file(path);
    if (!infoFile) {
        return Promise.resolve(); // 如果没有 Info.txt 文件，跳过
    }

    return infoFile.async("string").then(function(content) {
        let updatedContent = content.replace(oldPlatform, newPlatform);
        if (removeLine) {
            updatedContent = updatedContent.replace(removeLine, '');
        }
        if (addLine) {
            updatedContent += `\n${addLine}`;
        }
        zip.file(path, updatedContent);
    });
}

function updateTilFiles(zip, path, updateTilContent) {
    const tilFile = zip.file(path);
    if (!tilFile) {
        return Promise.resolve(); // 如果没有 til 文件，跳过
    }

    return tilFile.async("string").then(function(content) {
        const updatedContent = updateTilContent(content);
        zip.file(path, updatedContent);
    });
}

function updateTilForBDS(content) {
    return content.replace(
        `[IMG1]\nSOURCE_RECT=0,0,0,0`,
        `[IMG1]\nSOURCE_RECT=0,70,1080,109`
    ).replace(
        `[IMG2]\nSOURCE_RECT=0,0,0,0`,
        `[IMG2]\nSOURCE_RECT=0,100,1080,541`
    ).replace(
        `[IMG3]\nSOURCE_RECT=0,0,1080,820`,
        `[IMG3]\nSOURCE_RECT=0,179,1080,595`
    ).replace(
        `[IMG4]\nSOURCE_RECT=0,0,0,0`,
        `[IMG4]\nSOURCE_RECT=0,0,1080,70`
    ).replace(
        `[IMG5]\nSOURCE_RECT=0,179,1080,641`,
        `[IMG5]\nSOURCE_RECT=0,179,1080,595`
    );
}

function updateTilForBDI(content) {
    return content.replace(
        `[IMG1]\nSOURCE_RECT=0,70,1080,109`,
        `[IMG1]\nSOURCE_RECT=0,0,0,0`
    ).replace(
        `[IMG2]\nSOURCE_RECT=0,100,1080,541`,
        `[IMG2]\nSOURCE_RECT=0,0,0,0`
    ).replace(
        `[IMG3]\nSOURCE_RECT=0,179,1080,595`,
        `[IMG3]\nSOURCE_RECT=0,0,1080,820`
    ).replace(
        `[IMG4]\nSOURCE_RECT=0,0,1080,70`,
        `[IMG4]\nSOURCE_RECT=0,0,0,0`
    ).replace(
        `[IMG5]\nSOURCE_RECT=0,179,1080,595`,
        `[IMG5]\nSOURCE_RECT=0,179,1080,641`
    );
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
