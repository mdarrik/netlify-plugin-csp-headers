# Netlify Plugin CSP Headers

Add strict Content Security Policy (CSP) headers to your site.

While static sites are fairly secure, there's still a risk of Cross Site Scripting and other malicious attacks affecting your users. Having a solid Content Security Policy can help mitigate those risks further. 

CSP Headers can also help you get better scores on some automated tests, like [Web Page Test](https://www.webpagetest.org/)

## Installation
Currently, this plugin is not available in the Netlify UI. To install it, perform the following steps: 

1. Add it to your Netlify.toml by adding the following to the Netlify.toml. This plugin should go after any other plugins that modify your html pages. This will prevent hashes from getting mismatched. 
```toml
[[plugins]]
package = "netlify-plugin-csp-headers"
```
1. Install the plugin in your package.json using either npm or yarn. 
```bash
npm install -D netlify-plugin-csp-headers
```
```bash
yarn add -D netlify-plugin-csp-headers
```
1. Deploy your site. If you have deploy previews turned on, it's probably best to test this plugin in a deploy preview. This can help you make sure you don't accidentally break your site when you turn on CSP headers. Typically, this involves making the above changes in a pull request. 

## Inputs/Options

|Input | Environment Variable | Allowed Values | Description 
--- | --- | --- | ---
|`unsafeStyles` | `CSP_HEADERS_UNSAFE_STYLES` | `true`, `false` |  A value of `true` removes the style tag hashes from your inline styles. This way any post-processing modifications/runtime styles still work on your site. 
|`reportUrl` | `CSP_HEADERS_REPORT_URL` | a url (relative or absolute) | Browsers will send CSP reports to this url. By recording these values, you can keep track of violations. Useful for both debugging & security purposes. 



## Warning about Netlify Asset Optimizations

To improve the security of inline script & style tags, it takes a hash of the contents. This can stop attackers from modifying them after you've deployed your site. It also prevents new ones from being added. However, this also means that Netlify's Asset Optimization can break your site. Because Asset Optimization changes the URLs of static assets like fonts after your build is complete, it makes the hashes no longer match the ones generated by this plugin. This causes your browser to block those inline assets. Unfortunately, I haven't come up with a good way around this since the URLs are randomly generated. Unfortunately, even if you only use the Pretty URLs optimization, self hosted font urls will still get replaced. To get around this, I currently see 3 options: 

1. Move all `<style>` tags with font declarations to an external file. This will add additional network requests to your page load, and may cause performance to drop slightly. 
1. Turn off all optimizations (including pretty urls 😢). This will stop Netlify from changing anything about your code. You'll also be responsible for optimizing all of your own assets. It may also prevent "pretty urls" from working correctly on your site (so pages might be at `https://example.com/route/index.html` instead of `https://example.com/route/`). 
1. Add the environment variable `CSP_HEADERS_UNSAFE_STYLE` with a value of `true` in your Netlify UI Dashboard. The plugin will then not include any hashes for style tags in the CSP headers. This is probably mostly safe. However, there are some risks of malicious `<style>` elements, especially around images. The default CSP header added by the site should prevent at least some of the risks associated with images. 



