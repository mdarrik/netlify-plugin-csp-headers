const crypto = require("crypto");
const fs = require('fs/promises');
const path = require('path');

const unified = require('unified');
const parseHtml = require('rehype-parse');
const visit = require('unist-util-visit');
const isScriptTag = require('hast-util-is-javascript');
const isStyleTag = require('hast-util-is-css-style')
const isCssLink = require('hast-util-is-css-link')

module.exports= {
    onPostBuild: async function({constants, utils}) {
        try {
            const htmlFiles = await getHtmlFilesFromDir(constants.PUBLISH_DIR)
            const cspHashesPromises = htmlFiles.map(file => processHtmlFile(file));
            const cspHashes = await Promise.all(cspHashesPromises);
            const redirectStrings = cspHashes.map((hashData) => generateRedirectString(hashData, constants.PUBLISH_DIR));
           await fs.appendFile(path.join(constants.PUBLISH_DIR, '_headers'), redirectStrings.join(' '))  
           utils.status.show({
               title: 'Source Hashing Completed Successfully',
               summary: `${htmlFiles.length} Files Processed. ${cspHashes.reduce((numHashesCounted, currentHash) => 
                    numHashesCounted + currentHash.hashes.script.length + currentHash.hashes.style.length, 0)} tags processed`,
               text: cspHashes.map((hash) => `file: ${hash.filePath}, number of script tags added to CSP headers: ${hash.hashes.script.length}, number of style tags added to CSP headers: ${hash.hashes.style.length}`).join('\n')
           }) 
        } catch (error) {
            utils.build.failPlugin(error.message);
        }
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
    for(let i = 0; i< filesInCurrentDir.length; i++) {
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

async function processHtmlFile(filePath) {
    const file = await fs.readFile(filePath, {encoding: 'utf-8'})
    const ast = unified().use(parseHtml).parse(file);
    const hashes = visitNode(ast);
    return {filePath: filePath, hashes}
}

function visitNode(tree) {
    const hashLists = {script: [], style: []}
    visit(tree, [isScriptTag, isStyleTag, isCssLink] , function(node) {
        if(!node.properties.src && node.tagName !== 'link') {
        const sha256Hash = crypto.createHash('sha256')
        sha256Hash.update(node.children[0].value)
        hashLists[node.tagName].push(`'sha256-${sha256Hash.digest('base64')}'`)
        } else if(node.properties.src) {
            hashLists[node.tagName].push(`'${node.properties.src}'`);
        } else if(node.tagName === 'link') {
            hashLists.style.push(`'${node.properties.href}'`);
        }
    })
    return hashLists
}


function generateRedirectString({filePath, hashes}, publishPath) {
const url = filePath.replace(publishPath, '').replace(/^\/index.html/, '/');
return (
`${url}
    Content-Security-Policy: default-src 'self'; script-src 'self' 'strict-dynamic' 'unsafe-inline' ${hashes['script'].join(" ")}; style-src 'self' 'unsafe-inline' ${hashes['style'].join(' ')};
`)
}