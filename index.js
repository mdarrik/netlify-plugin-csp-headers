crypto = require("crypto");
fs = require('fs/promises');
path = require('path')

module.exports= {
    onPostBuild: async function({constants}) {
        console.log(await getHtmlFilesFromDir(constants.PUBLISH_DIR));
    }
}


/**
 *Recursively searches a directory for all html files. 
 *
 * @param {string} directory
 * @returns {string[]} A list of HTML Files in the directory
 */
async function getHtmlFilesFromDir(directory) {
    // gets all the files in the current directory as a dirent //not sure if this is the right choice? may hit issues with symbolic links?
    const filesInCurrentDir = await fs.readdir(directory, {withFileTypes: true});
    // variable to store all of the values from the recursive directories. This allows Promise.all
    const dirPromises = [];
    // the output array of html files
    const htmlFiles = [];
    // searches all files in the current directory. If html, add to htmlFiles, otherwise if directory recurse. 
    for(i = 0; i< filesInCurrentDir.length; i++) {
        const currentFile = filesInCurrentDir[i];
        if(currentFile.isDirectory()) {
            dirPromises.push(getHtmlFilesFromDir(path.join(directory, currentFile.name)))
        } else if(currentFile.isFile() && /\.html$/.test(currentFile.name)) {
            htmlFiles.push(path.join(directory, currentFile.name))
        }
    }
    // await all the sub directories and then push the files to 
    const HtmlFilesInSubDirectories = await Promise.all(dirPromises);
    HtmlFilesInSubDirectories.forEach(fileList => {
        htmlFiles.push(...fileList);
    });
    return htmlFiles;
}