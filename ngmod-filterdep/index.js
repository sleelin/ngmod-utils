/*
 * ngmod-filterdep
 * https://bitbucket.org/sleelin/ngmod-wiredep
 *
 * Copyright (c) 2015 S. Lee-Lindsay
 * Licensed under the GNU license.
 */

var path = require("path"),
    through = require("through2"),
    esprima = require("esprima"),
    astra = require("astra"),
    es = require("event-stream"),
    File = require("vinyl"),
    fs = require("vinyl-fs"),
    gutil = require("gulp-util"),
    _ = require("lodash");

module.exports = function (opts) {
    var modules = [],
        options = _.assign({unique: false}, opts);

    return through.obj(function transform(file, enc, next) {
        var stream = this;

        traverse(file, function (name, deps) {
            if (options.unique && _.some(modules, "name", name)) {
                stream.emit("error", new Error("Duplicate module definition"));
            } else {
                // Find modules that depend on this module
                _.chain(modules).where({deps: [name]}).pluck("deps").value().forEach(function (deps) {
                    // Replace the module name with this file reference
                    if (_.includes(deps, name)) {
                        deps[deps.indexOf(name)] = file;
                    }
                });

                // Save reference for later modules
                modules.push({
                    name: name,
                    deps: [file].concat(_.chain(deps).map(function (module) {
                        // Replace dependency names with file references for existing modules
                        return _.chain(modules).where({name: module}).pluck("deps").first().first().value() || module;
                    }).value())
                });
            }
        });

        next();
    }, function flush(next) {
        var stream = this,
            dependencies = [],
            files = _.chain(modules[0].deps).without(modules[0].deps[0]).value(),
            file;

        // Only accumulate dependencies that are referenced from the first file
        while (files.length > 0) {
            dependencies.push(file = files.shift());
            files = _.uniq(files.concat(_.chain(modules).without(modules[0]).pluck("deps").find({0: file}).without(file).filter(_.negate(_.isString)).compact().value()))
        }

        // Emit the files
        es.merge(_.uniq(dependencies).map(function (file) {
            stream.push(file);

            // Also look for stylesheets if they exist
            return fs.src(gutil.replaceExtension(file.relative, ".css"), {cwd: file.base})
                .pipe(through.obj(function (file, enc, next) {
                    stream.push(file);
                    next();
                }))
        })).on("end", function () {
            // Always assume the first file to enter the stream is a required dependency
            stream.push(modules[0].deps[0]);

            next();
        });
    });
};

function traverse(file, callback) {
    try {
        // Parse source file contents and traverse AST, searching for angular module definitions
        astra(esprima.parse(file.contents.toString())).when({
            type: "CallExpression",
            callee: {
                type: "MemberExpression",
                object: {type: "Identifier", name: "angular"},
                property: {type: "Identifier", name: "module"}
            },
            arguments: []
        }, function (chunk) {
            var src = _.chain(chunk.arguments);

            if (chunk.arguments.length === 2) {
                // Pluck module name and dependencies and call the callback
                callback.apply(file, [
                    src.where({type: "Literal"}).pluck("value").first().value(),
                    src.where({type: "ArrayExpression"}).pluck("elements").first().pluck("value").value()
                ]);
            }
        }).run();
    } catch (ex) {
        // Do nothing, not a JavaScript file
    }
}

