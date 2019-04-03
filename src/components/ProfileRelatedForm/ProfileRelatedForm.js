// @flow
import * as React from 'react';
import { Keyboard } from 'react-native';
import t from 'tcomb-form-native';
import TextInput from 'components/TextInput';

export const { Form } = t.form;

export const InputTemplate = (locals) => {
  const { config } = locals;
  const errorMessage = locals.error;
  const inputProps = {
    autoCapitalize: config.autoCapitalize || 'words', // THIS HAS TO BE ADJUSTABLE
    onChange: locals.onChange,
    onBlur: locals.onBlur,
    value: locals.value,
    keyboardType: locals.keyboardType || 'default',
    style: {
      fontSize: 24,
      lineHeight: 0,
    },
    placeholder: config.placeholder || '',
    ...config.inputProps,
  };

  const propsToInclude = {};

  console.log({ locals, label: locals.label })
  if (config.includeLabel) {
    propsToInclude.label = locals.label;
  }

  if (config.isLoading !== undefined) {
    propsToInclude.loading = config.isLoading;
  }

  if (config.viewWidth) {
    propsToInclude.viewWidth = config.viewWidth;
  }

  return (
    <TextInput
      errorMessage={errorMessage}
      id={locals.label}
      inputProps={inputProps}
      inputType="secondary"
      noBorder
      {...propsToInclude}
    />
  );
}
