# ngmod-utils
A collection of utilities for manipulating streamed AngularJS 1.x source files for bundling.
Each directory contains a standalone NPM package with a single utility.

> [!WARNING]
> These utilities are designed for an obsolete technology stack and are not compatible with their modern equivalents.
> The code here is provided as-is for archiving purposes, and will not receive any further updates.

## Utilities
### ngmod-concat
Parse streamed JavaScript files for AngularJS module definitions, and emit a single new file for each detected module, with concatenated contents of other files referencing the same module.

### ngmod-filterdep
Parse streamed JavaScript files for AngularJS module definition and dependencies, and emit only dependent files.

### ngmod-stylesheet
Parse streamed JavaScript files for AngularJS module definitions and emit CSS files with concatenated contents of all CSS files detected within the module directory.

### ngmod-templateurl
Parse streamed JavaScript files for templateUrl properties (used in AngularJS directive definition objects), and emit template files with paths matching expected templateUrl.
