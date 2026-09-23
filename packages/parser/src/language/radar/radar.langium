grammar RadarGrammar
import "../common/common";

entry Radar:
    NEWLINE*
    ('radar-beta' | 'radar-beta:' | 'radar-beta' ':')
    NEWLINE*
    (
        TitleAndAccessibilities
        | 'axis' axes+=Axis (',' axes+=Axis)*
        | 'curve' curves+=Curve (',' curves+=Curve)*
        | options+=Option (',' options+=Option)*
        | NEWLINE
    )*
;

fragment Label:
    '[' label=STRING ']'
;

Axis:
    name=RadarID (Label)?
;

Curve:
    name=RadarID (Label)? '{' Entries '}'
;

RadarID returns string:
    ID | 'null'
;

fragment Entries:
    NEWLINE* entries+=NumberEntry (',' NEWLINE* entries+=NumberEntry)* NEWLINE* |
    NEWLINE* entries+=DetailedEntry (',' NEWLINE* entries+=DetailedEntry)* NEWLINE*
;

interface Entry {
    axis?: @Axis;
    range?: string;
    value?: number;
    missing?: boolean;
}
DetailedEntry returns Entry:
    axis=[Axis:RadarID] ':'? (range=RANGE | value=NUMBER | missing?='null')
;
NumberEntry returns Entry:
    (range=RANGE | value=NUMBER | missing?='null')
;

Option:
    (
        name='showLegend' value=BOOLEAN
        | name='ticks' value=NUMBER
        | name='max' value=NUMBER
        | name='min' value=NUMBER
        | name='graticule' value=GRATICULE
    )
;   

terminal GRATICULE returns string: 'circle' | 'polygon';
terminal RANGE returns string: /\[[0-9]+(?:\.[0-9]+)?\.\.[0-9]+(?:\.[0-9]+)?\]/;
