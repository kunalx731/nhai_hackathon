import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { RegisteredUser } from '../types/face';
import { getAllRegisteredUsers, deleteRegisteredUser } from '../services/faceTemplateStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RegisteredUsers'>;
};

export default function RegisteredUsersScreen({ navigation }: Props) {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllRegisteredUsers();
      setUsers(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers])
  );

  function confirmDelete(user: RegisteredUser) {
    Alert.alert(
      'Delete Registration',
      `Remove all face templates for "${user.name}" (${user.employeeId})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRegisteredUser(user.employeeId);
            await loadUsers();
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: RegisteredUser }) {
    const date = new Date(item.createdAt).toLocaleDateString();
    return (
      <View style={styles.card}>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardId}>{item.employeeId}</Text>
          <View style={styles.metaRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{item.templates.length} template{item.templates.length !== 1 ? 's' : ''}</Text>
            </View>
            <Text style={styles.dateText}>Registered {date}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => confirmDelete(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Registered Users</Text>
        <Text style={styles.subtitle}>
          {users.length} employee{users.length !== 1 ? 's' : ''} on file
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No registered users yet.</Text>
          <Text style={styles.emptyHint}>
            Register a face from the Home screen.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => u.employeeId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 6,
  },
  backText: {
    color: '#2563EB',
    fontSize: 15,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E3A5F',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    color: '#6B7280',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardId: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    color: '#6B7280',
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
});
