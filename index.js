const crypto = require("crypto");
const fs = require('fs/promises');
const path = require('path');

const unified = require('unified');
const parseHtml = require('rehype-parse');
const visit = require('unist-util-visit');
const isScriptTag = require('hast-util-is-javascript');
const isStyleTag = require('hast-util-is-css-style')
const isCssLink = require('hast-util-is-css-link')

let unsafeInlineStyles = process.env.CSP_HEADERS_UNSAFE_STYLES ?? false
let reportUrl = process.env.CSP_HEADERS_REPORT_URL
let allowCloudfrontSource = process.env.CSP_HEADERS_ALLOW_CLOUDFRONT_SOURCE

module.exports= {
    onPostBuild: async function({constants, utils, inputs}) {
        unsafeInlineStyles = inputs.unsafeStyles ?? unsafeInlineStyles
        allowCloudfrontSource = inputs.allowCloudfrontSource ?? allowCloudfrontSource
        reportUrl = inputs.reportUrl ?? reportUrl
        try {
            const htmlFiles = await getHtmlFilesFromDir(constants.PUBLISH_DIR)
            //process all html files asynchronously
            const cspHashesPromises = htmlFiles.map(file => processHtmlFile(file));
            const cspHashes = await Promise.all(cspHashesPromises);
            const reportToHeader = generateReportGroup();
            // generate cspStrings for each file and write to _headers file
            const cspHeadersStrings = cspHashes.map((hashData) => generateCSPHeader(hashData, constants.PUBLISH_DIR, reportToHeader));
           await fs.appendFile(path.join(constants.PUBLISH_DIR, '_headers'), cspHeadersStrings.join(' '))  
           // update the status to provide a summary.
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
    // await all the sub directory searches and then push the files to the array
    const HtmlFilesInSubDirectories = await Promise.all(dirPromises);
    HtmlFilesInSubDirectories.forEach(fileList => {
        htmlFiles.push(...fileList);
    });
    return htmlFiles;
}

/**
 *Reads the HtmlFile at "filePath" & generates the CSP hashes for the file. 
 * @param {string} filePath - Path to the file to be processed
 * @returns {{filePath: string, hashes: {script: [string], style: [string]}}}
 */
async function processHtmlFile(filePath) {
    const file = await fs.readFile(filePath, {encoding: 'utf-8'})
    const ast = unified().use(parseHtml).parse(file);
    const hashes = visitNode(ast);
    return {filePath: filePath, hashes}
}
/**
 *Traverses the AST and generates SHA256 hashes of the script & style tags. 
 *Also adds any urls provided in style "link" files or script src
 * @param {Node} tree - node of the tree in an AST
 * @returns {{[string], style: [string]}} An object with the hash values/arrays for the script & style CSP headers
 */
function visitNode(tree) {
    const hashLists = {script: [], style: []}
    visit(tree, [isScriptTag, isStyleTag, isCssLink] , function(node) {
        if(!node.properties.src && node.tagName !== 'link') {
        const sha256Hash = crypto.createHash('sha256')
        sha256Hash.update(node.children[0].value)
        hashLists[node.tagName].push(`'sha256-${sha256Hash.digest('base64')}'`)
        } else if(node.properties.src) {
            hashLists[node.tagName].push(`${node.properties.src}`);
        } else if(node.tagName === 'link') {
            hashLists.style.push(`${node.properties.href}`);
        }
    })
    return hashLists
}

/**
 *Generates the CSP headers for each file located at filePath. Uses the contents of hashes to generate the CSP strings. 
 *
 * @param {{filePath: string, hashes: {script: [string], style: [string]}}} {filePath, hashes}
 * @param {string} publishPath
 * @param {string} reportToHeader - Report-To header. 
 * @returns {string} A CSP string for the url created by filePath. 
 */
function generateCSPHeader({filePath, hashes}, publishPath, reportToHeader) {
const url = filePath.replace(publishPath, '').replace(/^\/index.html/, '/');
return (
`${url} ${reportToHeader === '' ? '' : `
    ${reportToHeader}`}
    Content-Security-Policy: default-src 'self' ${allowCloudfrontSource ? `https://*.cloudfront.net` : ''}; object-src 'none'; script-src 'self' 'strict-dynamic' 'unsafe-inline' ${hashes['script'].join(" ")}; style-src 'self' 'unsafe-inline' ${unsafeInlineStyles ? '' : hashes['style'].join(' ')}; ${ reportUrl == null ? null : `report-to netlify-csp-endpoint; report-uri ${reportUrl};`}
`)
}
/**
 *Generates the Report-To CSP string based on the reportUrl. 
 *
 * @returns {string} The Report-To header to be used in newer browsers for sending CSP reports to. 
 */
function generateReportGroup() {
    if(reportUrl === undefined || reportUrl === null) {
        return '';
    }
    const reportTo= {
        group: "netlify-csp-endpoint",
        max_age: "10886400",
        endpoints: [{
            url: reportUrl
        }]
    }
    return `Report-To: ${JSON.stringify(reportTo)}`
}