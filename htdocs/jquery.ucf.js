
(function($) {
    $.fn.ucf = function(options) {
        options = $.extend($.fn.ucf.defaults, options);

        $(this).each(function(x) {
            this.options = options;
            load_unicode_data(this);
            build_app(this);
        });

        return this;
    };

    $.fn.ucf.defaults = {
        sample_chars: [ 169, 233, 256, 257, 8364, 8451, 9733, 9731 ]
    }

    function build_app(app) {
        var form = $('<form class="ucf-app empty"></form>');
        form.submit(function() { return false; });
        $(app).append(form);

        form.append( char_info_pane(app, form) );
        form.append( char_search_field(app, form) );
        form.append( sample_char_links(app) );

        $(app).find('input.search').focus();
    }

    function char_search_field(app, form) {
        var div = $('<div class="search-wrap"><label>Search character descriptions:</label><br></div>');
        var inp = $('<input type="text" class="search" />');
        div.append(inp);

        inp.autocomplete({
            delay: 900,
            minLength: 1,
            source: function(request, response) {
                var target = request.term.toUpperCase();
                if(target != '') {
                    inp.addClass('busy');
                    setTimeout(function() {
                        execute_search(target, app, response, inp);
                    }, 2 );
                }
            },
            open: function(e, ui) {
                inp.removeClass('busy');
            },
            focus: function(e, ui) {
                return false;
            },
            select: function(e, ui) {
                var char_inp = $(app).find('input.char');
                char_inp.val(ui.item.character)
                char_changed(app, char_inp);
                window.scrollTo(0,0);
                return false;
            }
        })

        return div;
    }

    function char_info_pane(app, form) {
        var div = $('<div class="char-wrap"></div>');

        var panel1 = $('<div class="char-preview"></div>');
        var label1 = $('<div class="char-preview-label">Character<br />Preview</div>');
        var inp = $('<input type="text" class="char" title="Type or paste a character" />');
        panel1.append(
            label1, inp,
            $('<button type="button" class="prev-char" title="Previous character">◂</button>'),
            $('<button type="button" class="next-char" title="Next character">▸</button>')
        );

        var cb = function() { char_changed(app, inp) };
        inp.change( cb );
        inp.keypress(function(event) { setTimeout(cb, 50); });
        inp.mouseup(function(event) { setTimeout(cb, 50); });

        panel1.find('button.prev-char').click(function() {
            increment_code_point(app, inp, -1);
        });
        panel1.find('button.next-char').click(function() {
            increment_code_point(app, inp, 1);
        });

        var panel2 = $('<div class="char-props"></div>');
        var label2 = $('<div class="char-props-label">Character<br />Properties</div>');
        var info   = $('<div class="char-info"></div>');
        panel2.append(label2, info);

        div.append(panel1, panel2);

        return div;
    }

    function sample_char_links(app) {
        var chars = app.options.sample_chars;

        var div = $(
            '<div class="sample-wrap" title="click character to select">'
            + 'Examples … </div>'
        );

        var list = $('<ul></ul>');
        for(i = 0; i < chars.length; i++) {
            var item = $('<li></li>');
            item.text(codepoint_to_string(chars[i]));
            list.append(item);
        }
        div.append(list);

        list.find('li').click(function (event) {
            var inp = $(app).find('input.char');
            inp.val($(this).text());
            char_changed(app, inp);
        });
        return div;
    }

    function execute_search(target, app, response, inp) {
        var result = [ ];
        var chart  = app.code_chart;
        var codes  = app.code_list;
        var len    = codes.length;
        var code, char, character, div;
        for(var i = 0; i < len; i++) {
            if(result.length > 10) { break };
            code = codes[i];
            char = chart[code];
            if(
                char.description.indexOf(target) >= 0
                || (char.alias && char.alias.indexOf(target) >= 0)
            ) {
                character = codepoint_to_string(hex2dec(code));
                div = $('<div />').text(char.description);
                if(char.alias) {
                    div.append( $('<span class="code-alias" />').text(char.alias) );
                }
                result.push({
                    'code': code,
                    'character': character,
                    'label': '<div class="code-point">U+' + code + '</div>'
                             + '<div class="code-sample">&#160;' + character
                             + '</div><div class="code-descr">' + div.html()
                             + '</div>'
                });
            }
        }
        if(result.length == 0) {
            inp.removeClass('busy');
        }
        response(result);
    }

    function char_changed(app, inp) {
        var txt = inp.val();
        var len = txt.length;
        if(len == 0) {
            $(app).find('form').addClass('empty');
        }
        else {
            $(app).find('form').removeClass('empty');
        }
        if(len > 1) {
            if((txt.charCodeAt(len - 2) & 0xF800) == 0xD800) {
                inp.val(txt.substr(txt.length - 2, 1));
            }
            else {
                inp.val(txt.substr(txt.length - 1, 1));
            }
        }
        examine_char(app, inp);
    }

    function examine_char(app, inp) {
        var char = inp.val();
        if(char == app.last_char) {
            return;
        }
        if(char.length == 0) {
            $(app).find('div.char-info').hide();
            return;
        }
        app.last_char = char;
        var code  = string_to_codepoint(char);
        var hex   = dec2hex(code, 4);
        var block = codepoint_to_block(app, code);
        char      = app.code_chart[hex];

        var table = $('<table />')
        table.append(
            $('<tr />').append(
                $('<th />').text('Code point'),
                $('<td />').text('U+' + hex)
            )
        );
        if(char && char.description.length > 0) {
            var td = $('<td />').text(char.description);
            if(char.alias) {
                td.append(
                    $('<br />'),
                    $('<span class="alias"/>').text(char.alias)
                );
            }
            table.append(
                $('<tr />').append( $('<th />').text('Description'), td )
            );
        }
        table.append(
            $('<tr />').append(
                $('<th />').text('HTML entity'),
                $('<td />').text('&#' + code + ';')
            )
        );
        if(block) {
            var pdf_link = $('<a />')
                .text(block.title)
                .attr('href', block.pdf_url)
                .attr('title', block.filename + ' at Unicode.org');
            table.append(
                $('<tr />').append(
                    $('<th />').text('Character block'),
                    $('<td />').append(pdf_link)
                )
            );
        }
        $(app).find('div.char-info').empty().append(table).show();
    }

    function increment_code_point(app, inp, inc) {
        var char = app.last_char
        if(!char) { return; }
        var code = string_to_codepoint(char) + inc;
        var hex  = dec2hex(code, 4);
        while(!app.code_chart[hex]) {
            code = code + inc;
            if(code < 0) { return; }
            hex = dec2hex(code, 4);
        }
        inp.val(codepoint_to_string(code));
        examine_char(app, inp);
    }

    function dec2hex(dec, len) {
        var hex = dec.toString(16).toUpperCase();
        while (hex.length < len) { hex = "0" + hex; }
        return hex;
    }

    function hex2dec(hex) {
        return parseInt(hex, 16);
    }

    function load_unicode_data(app) {
        $.get('./char-data.txt', null, function(data, status) {
            parse_unicode_data(app, data, status);
        }, 'text' );
    }

    function parse_unicode_data(app, data, status) {
        var i = 0;
        var chart  = { };
        var codes  = [ ];
        var blocks = [ ];
        var j, str, row, code, block;
        while(i < data.length) {
            j = data.indexOf("\n", i);
            if(j < 1) { break; }
            row = data.substring(i, j).split("\t");
            if(row[0] == 'BLK') {
                block = {
                    'start'    : row[1],
                    'end'      : row[2],
                    'start_dec': hex2dec(row[1]),
                    'end_dec'  : hex2dec(row[2]),
                    'title'    : row[3],
                    'filename' : row[4],
                    'pdf_url'  : row[5],
                };
                blocks.push(block);
            }
            else {
                code = row.shift();
                chart[code] = {
                    'description': row[0],
                };
                if(row[1] && row[1].length > 0) {
                    chart[code].alias = row[1];
                }
                codes.push(code);
            }
            i = j + 1;
        }
        app.code_chart  = chart;
        app.code_list   = codes;
        app.code_blocks = blocks;
    }

    function codepoint_to_string(i) {
        if(i < 65536) {
            return String.fromCharCode(i);
        }
        var hi = Math.floor((i - 0x10000) / 0x400) + 0xD800;
        var lo = ((i - 0x10000) % 0x400) + 0xDC00;
        return String.fromCharCode(hi) + String.fromCharCode(lo);
    }

    function string_to_codepoint(str) {
        var hi = str.charCodeAt(0);
        if((hi & 0xF800) != 0xD800) {
            return hi;
        }
        var lo = str.charCodeAt(1);
        return ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
    }

    function codepoint_to_block(app, code) {
        for(i = 0; i < app.code_blocks.length; i++) {
            if(code > app.code_blocks[i].end_dec){
                continue;
            }
            if(code < app.code_blocks[i].start){
                return;
            }
            return app.code_blocks[i];
        }
        return;
    }

})(jQuery);

